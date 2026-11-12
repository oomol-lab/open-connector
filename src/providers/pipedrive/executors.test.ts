import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";
import { requirePipedriveAccess } from "./runtime.ts";

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
      oauthCredential({ api_domain: "https://acme.pipedrive.com", scope: "deals:full contacts:read" }),
      {
        fetcher: async (url, init) => {
          const headers = new Headers(init?.headers);
          expect(url.toString()).toBe("https://acme.pipedrive.com/v1/users/me");
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
});
