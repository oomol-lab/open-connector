import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, proxy } from "./executors.ts";
import { confluenceActionHandlers, confluenceDefaultTimeoutMs, requestConfluenceJson } from "./runtime.ts";
import { confluenceOAuthScopes } from "./scopes.ts";

const oauthCredential = {
  authType: "oauth2" as const,
  accessToken: "confluence-oauth-token",
  tokenType: "Bearer",
  profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
  metadata: {},
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Confluence OAuth credentials", () => {
  it("discovers the authorized cloud site and validates its v2 API", async () => {
    const requests: URL[] = [];
    const result = await credentialValidators.oauth2!(oauthCredential, {
      fetcher: async (input, init) => {
        const url = new URL(input.toString());
        requests.push(url);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer confluence-oauth-token");
        if (url.pathname === "/oauth/token/accessible-resources") {
          return Response.json([
            {
              id: "cloud-123",
              name: "Docs",
              url: "https://docs.atlassian.net",
              scopes: confluenceOAuthScopes,
              avatarUrl: "https://docs.atlassian.net/avatar.png",
            },
          ]);
        }
        expect(url.pathname).toBe("/ex/confluence/cloud-123/wiki/api/v2/spaces");
        expect(url.searchParams.get("limit")).toBe("1");
        return Response.json({ results: [{ id: "space-1" }] });
      },
    });

    expect(requests).toHaveLength(2);
    expect(result).toMatchObject({
      profile: {
        accountId: "confluence:cloud-123",
        displayName: "Docs",
        grantedScopes: confluenceOAuthScopes,
      },
      grantedScopes: confluenceOAuthScopes,
      metadata: {
        cloudId: "cloud-123",
        siteUrl: "https://docs.atlassian.net",
        baseUrl: "https://api.atlassian.com/ex/confluence/cloud-123/wiki/api/v2",
        restApiBaseUrl: "https://api.atlassian.com/ex/confluence/cloud-123/wiki/rest/api",
        validationEndpoint: "/spaces",
        validationResultCount: 1,
      },
    });
  });

  it("requires explicit selection when authorization covers multiple Confluence sites", async () => {
    await expect(
      credentialValidators.oauth2!(oauthCredential, {
        fetcher: async () =>
          Response.json([
            {
              id: "cloud-1",
              url: "https://one.atlassian.net",
              scopes: ["read:space:confluence"],
            },
            {
              id: "cloud-2",
              url: "https://two.atlassian.net",
              scopes: ["read:space:confluence"],
            },
          ]),
      }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("multiple sites") });
  });

  it("times out accessible-resource discovery", async () => {
    vi.useFakeTimers();
    const validation = credentialValidators.oauth2!(oauthCredential, {
      fetcher: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
            once: true,
          });
        }),
    }).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(confluenceDefaultTimeoutMs);

    await expect(validation).resolves.toMatchObject({
      status: 504,
      message: expect.stringContaining("timed out"),
    });
  });
});

describe("Confluence API token credentials", () => {
  it("keeps validating API tokens with Basic authentication", async () => {
    const result = await credentialValidators.apiKey!(
      {
        apiKey: "api-token",
        values: { email: "owner@example.com", siteUrl: "https://docs.atlassian.net" },
      },
      {
        fetcher: async (input, init) => {
          expect(new URL(input.toString()).pathname).toBe("/wiki/api/v2/spaces");
          expect(new Headers(init?.headers).get("authorization")).toBe(
            `Basic ${Buffer.from("owner@example.com:api-token").toString("base64")}`,
          );
          return Response.json({ results: [] });
        },
      },
    );

    expect(result).toMatchObject({
      profile: {
        accountId: "confluence:docs.atlassian.net:owner@example.com",
        displayName: "owner@example.com (docs.atlassian.net)",
      },
      metadata: {
        baseUrl: "https://docs.atlassian.net/wiki/api/v2",
        restApiBaseUrl: "https://docs.atlassian.net/wiki/rest/api",
      },
    });
  });
});

describe("Confluence action routing", () => {
  it("routes CQL search through the v1 REST endpoint with OAuth bearer auth", async () => {
    const fetcher: ProviderFetch = async (input, init) => {
      const url = new URL(input.toString());
      expect(url.pathname).toBe("/ex/confluence/cloud-123/wiki/rest/api/search");
      expect(url.searchParams.get("cql")).toBe('type = "page"');
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer confluence-oauth-token");
      return Response.json({ results: [], _links: {} });
    };

    await expect(
      confluenceActionHandlers.search_content(
        { cql: 'type = "page"' },
        {
          baseUrl: "https://api.atlassian.com/ex/confluence/cloud-123/wiki/api/v2",
          restApiBaseUrl: "https://api.atlassian.com/ex/confluence/cloud-123/wiki/rest/api",
          auth: { type: "oauth2", accessToken: "confluence-oauth-token", tokenType: "Bearer" },
          fetcher,
        },
      ),
    ).resolves.toEqual({ results: [], pagination: { nextCursor: null } });
  });

  it("reports an unavailable v1 base URL separately from missing site metadata", async () => {
    const fetcher = vi.fn<ProviderFetch>();

    await expect(
      requestConfluenceJson({
        baseUrl: "https://docs.atlassian.net",
        auth: { type: "oauth2", accessToken: "confluence-oauth-token", tokenType: "Bearer" },
        fetcher,
        method: "GET",
        path: "/search",
        phase: "execute",
        apiVersion: "v1",
      }),
    ).rejects.toMatchObject({ status: 400, message: "Confluence REST v1 base URL is unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Confluence proxy authentication", () => {
  it("authenticates OAuth and API-token proxy requests with the resolved credential", async () => {
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetcher);
    const apiKeyCredential: Extract<ResolvedCredential, { authType: "api_key" }> = {
      authType: "api_key",
      apiKey: "api-token",
      values: { email: "owner@example.com", siteUrl: "https://docs.atlassian.net" },
      profile: { accountId: "api-key", displayName: "API Token", grantedScopes: [] },
      metadata: {
        email: "owner@example.com",
        baseUrl: "https://docs.atlassian.net/wiki/api/v2",
      },
    };
    const cases: Array<{ credential: ResolvedCredential; authorization: string }> = [
      {
        credential: {
          ...oauthCredential,
          metadata: {
            baseUrl: "https://api.atlassian.com/ex/confluence/cloud-123/wiki/api/v2",
          },
        },
        authorization: "Bearer confluence-oauth-token",
      },
      {
        credential: apiKeyCredential,
        authorization: `Basic ${Buffer.from("owner@example.com:api-token").toString("base64")}`,
      },
    ];

    for (const testCase of cases) {
      const context: ExecutionContext = { getCredential: async () => testCase.credential };
      await expect(proxy({ method: "GET", endpoint: "/spaces" }, context)).resolves.toMatchObject({ ok: true });
    }

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(requests.map((request) => new Headers(request.headers).get("authorization"))).toEqual(
      cases.map((testCase) => testCase.authorization),
    );
  });
});
