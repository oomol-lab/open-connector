import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { githubActions } from "./actions.ts";
import { clearGitHubInstallationTokenCache } from "./app-installation.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

const appId = "5360099";
const installationId = "172567438";
const installationToken = "ghs_installation_token";

let privateKey: string;
let installationContext: ExecutionContext;
let apiKeyContext: ExecutionContext;

beforeAll(() => {
  privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs1", format: "pem" })
    .toString();
  const installation: ResolvedCredential = {
    authType: "custom_credential",
    values: { appId, installationId, privateKey },
    profile: { accountId: "bakey", displayName: "GitHub App installation on bakey", grantedScopes: [] },
    metadata: {},
  };
  installationContext = { getCredential: async () => installation };
  const apiKey: ResolvedCredential = {
    authType: "api_key",
    apiKey: "github_pat_secret",
    values: { apiKey: "github_pat_secret" },
    profile: { accountId: "bakey", displayName: "bakey", grantedScopes: [] },
    metadata: {},
  };
  apiKeyContext = { getCredential: async () => apiKey };
});

beforeEach(() => {
  clearGitHubInstallationTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Record every outgoing request and answer each one from the given queue. */
function stubFetch(responses: Array<() => Response>): Request[] {
  const requests: Request[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    const next = responses[requests.length - 1];
    if (!next) {
      throw new Error(`unexpected request ${requests.length}: ${requests[requests.length - 1]!.url}`);
    }
    return next();
  });
  return requests;
}

function mintResponse(): Response {
  return Response.json(
    {
      token: installationToken,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      permissions: { issues: "read", metadata: "read", pull_requests: "read" },
      repository_selection: "selected",
    },
    { status: 201 },
  );
}

function installationResponse(): Response {
  return Response.json({
    id: Number(installationId),
    account: {
      login: "bakey",
      id: 1566848,
      type: "User",
      avatar_url: "https://avatars.githubusercontent.com/u/1566848",
      html_url: "https://github.com/bakey",
    },
    repository_selection: "selected",
    permissions: { issues: "read", metadata: "read", pull_requests: "read" },
  });
}

function isAppJwt(authorization: string | null): boolean {
  return authorization?.startsWith("Bearer ") === true && authorization.slice("Bearer ".length).split(".").length === 3;
}

describe("GitHub App installation credential", () => {
  it("mints an installation token once and sends it as the bearer on repository actions", async () => {
    const requests = stubFetch([
      () => mintResponse(),
      () => Response.json([{ id: 1566848, login: "bakey", permissions: { pull: true, push: true } }]),
      () => Response.json([]),
    ]);

    const first = await executors["github.list_repository_collaborators"]!(
      { owner: "bakey", repo: "Kairos", affiliation: "all" },
      installationContext,
    );
    const second = await executors["github.list_pull_requests"]!(
      { owner: "bakey", repo: "Kairos" },
      installationContext,
    );

    expect(first).toMatchObject({ ok: true, output: { collaborators: [{ login: "bakey" }] } });
    expect(second).toMatchObject({ ok: true, output: { pull_requests: [] } });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      `POST /app/installations/${installationId}/access_tokens`,
      "GET /repos/bakey/Kairos/collaborators",
      "GET /repos/bakey/Kairos/pulls",
    ]);
    expect(isAppJwt(requests[0]!.headers.get("authorization"))).toBe(true);
    expect(requests[1]!.headers.get("authorization")).toBe(`Bearer ${installationToken}`);
    expect(requests[2]!.headers.get("authorization")).toBe(`Bearer ${installationToken}`);
    expect(new URL(requests[1]!.url).searchParams.get("affiliation")).toBe("all");
  });

  it("declares the current-user action's supported credential methods", () => {
    const action = githubActions.find((entry) => entry.name === "get_current_user");
    expect(action?.authTypes).toEqual(["oauth2", "api_key"]);
  });

  it("rejects get_current_user for installations before making any request", async () => {
    const requests = stubFetch([]);
    const result = await executors["github.get_current_user"]!({}, installationContext);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: expect.stringContaining("requires a personal access token or OAuth user credential"),
      },
    });
    expect(requests).toHaveLength(0);
  });

  it("lists the installation's repositories instead of the user's and ignores user-listing parameters", async () => {
    const requests = stubFetch([
      () => mintResponse(),
      () =>
        Response.json({
          total_count: 2,
          repository_selection: "selected",
          repositories: [
            { id: 1, name: "Kairos", full_name: "bakey/Kairos" },
            { id: 2, name: "WuYu-BizBuddy", full_name: "bakey/WuYu-BizBuddy" },
          ],
        }),
    ]);

    const result = await executors["github.list_my_repositories"]!(
      { visibility: "all", sort: "pushed", direction: "desc", perPage: 100, page: 1 },
      installationContext,
    );

    expect(result).toMatchObject({
      ok: true,
      output: { repositories: [{ full_name: "bakey/Kairos" }, { full_name: "bakey/WuYu-BizBuddy" }] },
    });
    // The action declares `{ repositories }`; the installation envelope's `total_count` is not leaked.
    expect((result as { output: Record<string, unknown> }).output).not.toHaveProperty("total_count");
    const url = new URL(requests[1]!.url);
    expect(url.pathname).toBe("/installation/repositories");
    // The installation listing has no visibility or ordering; only pagination is forwarded.
    expect([...url.searchParams.entries()]).toEqual([
      ["per_page", "100"],
      ["page", "1"],
    ]);
    expect(requests[1]!.headers.get("authorization")).toBe(`Bearer ${installationToken}`);
  });

  it.each(["api_key", "oauth2"])("keeps the user endpoints for %s credentials", async (authType) => {
    const context: ExecutionContext =
      authType === "api_key"
        ? apiKeyContext
        : {
            getCredential: async () => ({
              authType: "oauth2",
              accessToken: "oauth_token",
              tokenType: "Bearer",
              profile: { accountId: "bakey", displayName: "bakey", grantedScopes: [] },
              metadata: {},
            }),
          };
    const requests = stubFetch([
      () => Response.json({ login: "bakey", id: 1566848 }),
      () => Response.json([{ id: 1, name: "Kairos", full_name: "bakey/Kairos" }]),
    ]);

    await executors["github.get_current_user"]!({}, context);
    await executors["github.list_my_repositories"]!({ sort: "updated" }, context);

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual(["/user", "/user/repos"]);
    expect(new URL(requests[1]!.url).searchParams.get("sort")).toBe("updated");
    expect(requests[0]!.headers.get("authorization")).toBe(
      authType === "api_key" ? "Bearer github_pat_secret" : "Bearer oauth_token",
    );
  });

  it("surfaces a refused mint as the action's error instead of calling the endpoint", async () => {
    const requests = stubFetch([() => Response.json({ message: "Bad credentials" }, { status: 401 })]);

    const result = await executors["github.get_repository"]!({ owner: "bakey", repo: "Kairos" }, installationContext);

    expect(result).toMatchObject({ ok: false, error: { message: "Bad credentials" } });
    expect(requests).toHaveLength(1);
  });
});

describe("GitHub installation cancellation", () => {
  it.each(["action", "proxy"])("cancels a %s while another caller finishes the shared mint", async (entry) => {
    const mint = Promise.withResolvers<Response>();
    const requests: Request[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return request.url.endsWith("/access_tokens") ? mint.promise : Response.json({ id: 1 });
    });
    const controller = new AbortController();
    const context = { ...installationContext, signal: controller.signal };
    const cancelled =
      entry === "action"
        ? executors["github.get_repository"]!({ owner: "bakey", repo: "Kairos" }, context)
        : proxy({ method: "GET", endpoint: "/repos/bakey/Kairos" }, context);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const remaining = proxy({ method: "GET", endpoint: "/repos/bakey/Kairos" }, installationContext);
    controller.abort();
    expect(await cancelled).toMatchObject({ ok: false });
    expect(requests[0]!.signal.aborted).toBe(false);
    mint.resolve(mintResponse());
    expect(await remaining).toMatchObject({ ok: true });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.headers.get("authorization")).toBe(`Bearer ${installationToken}`);
  });
});

describe("GitHub App installation validation", () => {
  it("describes the installation and proves a token can be minted", async () => {
    const requests = stubFetch([() => installationResponse(), () => mintResponse()]);

    const result = await credentialValidators.customCredential!(
      { values: { appId, installationId, privateKey } },
      { fetcher: fetch },
    );

    expect(result).toMatchObject({
      profile: {
        accountId: "bakey",
        displayName: "GitHub App installation on bakey",
        grantedScopes: ["issues:read", "metadata:read", "pull_requests:read"],
      },
      metadata: {
        appId,
        installationId,
        accountType: "User",
        repositorySelection: "selected",
        permissions: { issues: "read", metadata: "read", pull_requests: "read" },
      },
    });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      `GET /app/installations/${installationId}`,
      `POST /app/installations/${installationId}/access_tokens`,
    ]);
    expect(isAppJwt(requests[0]!.headers.get("authorization"))).toBe(true);
  });

  it("reports the numeric App ID when the credential holds a client ID", async () => {
    stubFetch([
      () => Response.json({ id: Number(installationId), app_id: 5360099, account: { login: "bakey" } }),
      () => mintResponse(),
    ]);

    const result = await credentialValidators.customCredential!(
      { values: { appId: "Iv23liA1b2C3d4E5f6G7", installationId, privateKey } },
      { fetcher: fetch },
    );

    expect(result).toMatchObject({ metadata: { appId: "5360099" } });
  });

  it.each(["describe", "mint"])("cancels credential validation during %s", async (stage) => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      if (stage === "mint" && fetcher.mock.calls.length === 1) return Promise.resolve(installationResponse());
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      });
    });
    const result = expect(
      credentialValidators.customCredential!(
        { values: { appId, installationId, privateKey } },
        { fetcher, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ status: 504 });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(stage === "mint" ? 2 : 1));
    controller.abort();
    await result;
  });

  it("refuses an installation the App does not own", async () => {
    stubFetch([() => Response.json({ message: "Not Found" }, { status: 404 })]);

    await expect(
      credentialValidators.customCredential!({ values: { appId, installationId, privateKey } }, { fetcher: fetch }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
