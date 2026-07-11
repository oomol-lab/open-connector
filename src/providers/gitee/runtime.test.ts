import type { BearerProviderContext } from "../provider-runtime.ts";

import { describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { credentialValidators } from "./executors.ts";
import { giteeActionHandlers, validateGiteeCredential } from "./runtime.ts";

function context(fetcher: typeof fetch): BearerProviderContext {
  return {
    accessToken: "gitee-token",
    tokenType: "Bearer",
    fetcher,
  };
}

describe("Gitee runtime", () => {
  it("validates a token with the current user and preserves OAuth scopes", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({
          id: 42,
          login: "octocat-cn",
          name: "Octocat CN",
          html_url: "https://gitee.com/octocat-cn",
        }),
    );

    await expect(
      validateGiteeCredential("gitee-token", fetcher, undefined, ["user_info", "projects"]),
    ).resolves.toMatchObject({
      profile: {
        accountId: "gitee:42",
        displayName: "Octocat CN",
      },
      grantedScopes: ["user_info", "projects"],
      metadata: {
        validationEndpoint: "/user",
        currentUser: {
          id: 42,
          login: "octocat-cn",
        },
      },
    });

    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://gitee.com/api/v5/user");
    expect(init.headers).toMatchObject({
      authorization: "Bearer gitee-token",
      "user-agent": "oomol-connect/0.1",
    });
  });

  it("uses the same validation for API keys and OAuth credentials", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ id: 7, login: "gitee-user" }),
    );

    const apiKeyResult = await credentialValidators.apiKey?.(
      { apiKey: "personal-token", values: { apiKey: "personal-token" } },
      { fetcher },
    );
    const oauthResult = await credentialValidators.oauth2?.(
      {
        authType: "oauth2",
        accessToken: "oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: { scope: "user_info projects" },
      },
      { fetcher },
    );

    expect(apiKeyResult?.grantedScopes).toEqual([]);
    expect(oauthResult?.grantedScopes).toEqual(["user_info", "projects"]);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer personal-token" });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({ authorization: "Bearer oauth-token" });
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.has("access_token")).toBe(false);
    expect(new URL(String(fetcher.mock.calls[1]?.[0])).searchParams.has("access_token")).toBe(false);
  });

  it("lists repositories with Gitee pagination parameters", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json([{ id: 1, full_name: "acme/demo" }]),
    );

    await expect(
      giteeActionHandlers.list_my_repositories(
        {
          visibility: "private",
          q: "demo",
          sort: "updated",
          direction: "desc",
          page: 2,
          perPage: 50,
        },
        context(fetcher),
      ),
    ).resolves.toEqual({ repositories: [{ id: 1, full_name: "acme/demo" }] });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v5/user/repos");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      visibility: "private",
      q: "demo",
      sort: "updated",
      direction: "desc",
      page: "2",
      per_page: "50",
    });
  });

  it("encodes repository owner and path segments", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ id: 1, full_name: "team name/repo/name" }),
    );

    await giteeActionHandlers.get_repository({ owner: "team name", repo: "repo/name" }, context(fetcher));

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v5/repos/team%20name/repo%2Fname");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer gitee-token" });
  });

  it("maps authentication, rate limit, and malformed response failures", async () => {
    const unauthorized = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ message: "invalid access token" }, { status: 401 }),
    );
    const limited = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ message: "rate limit exceeded" }, { status: 429 }),
    );
    const malformed = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response("not-json", { status: 200 }),
    );
    const malformedShape = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => Response.json([]),
    );
    const notFound = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Response.json({ message: "repository not found" }, { status: 404 }),
    );
    const networkFailure = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Promise.reject(new Error("connection reset")),
    );

    await expect(validateGiteeCredential("bad-token", unauthorized)).rejects.toMatchObject({
      status: 400,
      message: "Gitee authentication failed: invalid access token",
    });
    await expect(giteeActionHandlers.get_current_user({}, context(limited))).rejects.toMatchObject({
      status: 429,
    });
    await expect(giteeActionHandlers.get_current_user({}, context(malformed))).rejects.toEqual(
      expect.objectContaining<Partial<ProviderRequestError>>({
        status: 502,
        message: "Gitee returned invalid JSON",
      }),
    );
    await expect(validateGiteeCredential("bad-shape", malformedShape)).rejects.toMatchObject({
      status: 502,
      message: "Gitee current user response is not an object",
    });
    await expect(
      giteeActionHandlers.get_repository({ owner: "acme", repo: "missing" }, context(notFound)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(giteeActionHandlers.get_current_user({}, context(networkFailure))).rejects.toMatchObject({
      status: 502,
      message: "Gitee request failed: connection reset",
    });
  });
});
