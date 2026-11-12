import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it, vi } from "vitest";
import { credentialValidators, proxy } from "./executors.ts";
import { pipedrivePath, requirePipedriveAccess } from "./runtime.ts";

function oauthCredential(metadata: Record<string, unknown>): Extract<ResolvedCredential, { authType: "oauth2" }> {
  return {
    authType: "oauth2",
    accessToken: "pd-oauth-token",
    tokenType: "Bearer",
    profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
    metadata,
  };
}

function contextWith(credential: ResolvedCredential | undefined): ExecutionContext {
  return { getCredential: async () => credential } as unknown as ExecutionContext;
}

describe("Pipedrive OAuth", () => {
  it("validates an OAuth credential against the account's api_domain with a bearer token", async () => {
    const result = await credentialValidators.oauth2!(
      oauthCredential({ api_domain: "https://acme.pipedrive.com", scope: "deals:full,contacts:read" }),
      {
        fetcher: async (url, init) => {
          const headers = new Headers(init?.headers);
          expect(url.toString()).toBe("https://acme.pipedrive.com/api/v1/users/me");
          expect(headers.get("authorization")).toBe("Bearer pd-oauth-token");
          expect(headers.has("x-api-token")).toBe(false);
          return Response.json({ success: true, data: { id: 7, name: "Alice", company_id: 3 } });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "7", displayName: "Alice" },
      grantedScopes: ["deals:full", "contacts:read"],
      metadata: { apiBaseUrl: "https://acme.pipedrive.com" },
    });
  });

  it("keeps API tokens on the shared API host with the token header", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "pd-token", values: {} },
      {
        fetcher: async (url, init) => {
          const headers = new Headers(init?.headers);
          expect(url.toString()).toBe("https://api.pipedrive.com/v1/users/me");
          expect(headers.get("x-api-token")).toBe("pd-token");
          expect(headers.has("authorization")).toBe(false);
          return Response.json({ success: true, data: { id: 8, name: "Bob" } });
        },
      },
    );

    expect(result).toMatchObject({ profile: { accountId: "8", displayName: "Bob" } });
  });

  it("selects the host and auth header from the stored credential", async () => {
    await expect(
      requirePipedriveAccess(contextWith(oauthCredential({ api_domain: "https://acme.pipedrive.com" }))),
    ).resolves.toEqual({
      authHeaders: { authorization: "Bearer pd-oauth-token" },
      origin: "https://acme.pipedrive.com",
    });
    await expect(requirePipedriveAccess(contextWith(oauthCredential({})))).resolves.toMatchObject({
      origin: "https://api.pipedrive.com",
    });
  });

  it.each(["https://evil.example.com", "http://acme.pipedrive.com", "https://acme.pipedrive.com:8443", "not a url"])(
    "refuses an api_domain that is not an https pipedrive.com address (%s)",
    async (apiDomain) => {
      await expect(requirePipedriveAccess(contextWith(oauthCredential({ api_domain: apiDomain })))).rejects.toThrow(
        "api_domain must be an https pipedrive.com address",
      );
    },
  );

  it("asks for credentials when none is connected", async () => {
    await expect(requirePipedriveAccess(contextWith(undefined))).rejects.toMatchObject({ status: 401 });
  });

  it("adds /api to v1 paths on a company host only", () => {
    expect(pipedrivePath("https://acme.pipedrive.com", "/v1/webhooks")).toBe("/api/v1/webhooks");
    expect(pipedrivePath("https://acme.pipedrive.com", "/api/v2/deals")).toBe("/api/v2/deals");
    expect(pipedrivePath("https://api.pipedrive.com", "/v1/webhooks")).toBe("/v1/webhooks");
  });

  it("sends proxy requests to the credential's host with the matching auth header", async () => {
    const requests: Array<{ url: string; authorization: string | null; token: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        requests.push({
          url: String(input),
          authorization: headers.get("authorization"),
          token: headers.get("x-api-token"),
        });
        return Response.json({ success: true });
      }),
    );
    try {
      const apiKey: ResolvedCredential = {
        authType: "api_key",
        apiKey: "pd-token",
        values: {},
        profile: { accountId: "8", displayName: "Bob", grantedScopes: [] },
        metadata: {},
      };
      const oauth = oauthCredential({ api_domain: "https://acme.pipedrive.com" });
      for (const [credential, endpoint] of [
        [oauth, "/v1/webhooks"],
        [oauth, "/api/v2/deals"],
        [apiKey, "/v1/webhooks"],
      ] as const) {
        await expect(proxy({ method: "GET", endpoint }, contextWith(credential))).resolves.toMatchObject({ ok: true });
      }
    } finally {
      vi.unstubAllGlobals();
    }

    expect(requests).toEqual([
      { url: "https://acme.pipedrive.com/api/v1/webhooks", authorization: "Bearer pd-oauth-token", token: null },
      { url: "https://acme.pipedrive.com/api/v2/deals", authorization: "Bearer pd-oauth-token", token: null },
      { url: "https://api.pipedrive.com/v1/webhooks", authorization: null, token: "pd-token" },
    ]);
  });
});
