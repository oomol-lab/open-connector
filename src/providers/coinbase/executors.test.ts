import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Coinbase credentials", () => {
  it("validates OAuth credentials with a bearer token and records granted scopes", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "coinbase-oauth-token",
        tokenType: "Bearer",
        refreshToken: "coinbase-refresh-token",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: { scope: "wallet:accounts:read,offline_access" },
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.coinbase.com/api/v3/brokerage/accounts");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer coinbase-oauth-token");
          return Response.json({
            accounts: [{ uuid: "account-1", name: "Primary" }],
            has_next: false,
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "account-1", displayName: "Primary" },
      grantedScopes: ["wallet:accounts:read", "offline_access"],
      metadata: { accountCount: 1 },
    });
  });

  it("executes account actions with OAuth bearer credentials", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://api.coinbase.com/api/v3/brokerage/accounts?limit=10");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer coinbase-oauth-token");
      return Response.json({ accounts: [], has_next: false, size: 0 });
    });
    vi.stubGlobal("fetch", fetch);
    const credential: ResolvedCredential = {
      authType: "oauth2",
      accessToken: "coinbase-oauth-token",
      tokenType: "Bearer",
      profile: { accountId: "account-1", displayName: "Primary", grantedScopes: ["wallet:accounts:read"] },
      metadata: { scope: "wallet:accounts:read" },
    };
    const context: ExecutionContext = { getCredential: async () => credential };

    const result = await executors["coinbase.list_accounts"]!({ limit: 10 }, context);

    expect(result).toMatchObject({ ok: true, output: { accounts: [], has_next: false, size: 0 } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps API key validation on the Coinbase JWT authentication path", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    await credentialValidators.apiKey!(
      { apiKey: pem, values: { keyName: "organizations/org/apiKeys/key" } },
      {
        fetcher: async (_url, init) => {
          const authorization = new Headers(init?.headers).get("authorization");
          expect(authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/u);
          return Response.json({ accounts: [] });
        },
      },
    );
  });
});
