import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors, proxy } from "./executors.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Alpaca credentials", () => {
  it("validates OAuth credentials against a live account and records scopes", async () => {
    const result = await credentialValidators.oauth2!(oauthCredential(), {
      fetcher: async (url, init) => {
        expect(url.toString()).toBe("https://api.alpaca.markets/v2/account");
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer alpaca-oauth-token");
        expect(headers.get("apca-api-key-id")).toBeNull();
        return Response.json({ id: "account-1", account_number: "PA123" });
      },
    });

    expect(result).toMatchObject({
      profile: { accountId: "account-1", displayName: "PA123" },
      grantedScopes: ["data"],
      metadata: { environment: "live", apiBaseUrl: "https://api.alpaca.markets" },
    });
  });

  it("falls back to a paper account when the OAuth token cannot access live trading", async () => {
    const requestedUrls: string[] = [];
    const result = await credentialValidators.oauth2!(oauthCredential(), {
      fetcher: async (url) => {
        requestedUrls.push(url.toString());
        if (url.toString().startsWith("https://api.alpaca.markets/")) {
          return Response.json({ message: "not authorized" }, { status: 401 });
        }
        return Response.json({ id: "paper-account", account_number: "PA-PAPER" });
      },
    });

    expect(requestedUrls).toEqual([
      "https://api.alpaca.markets/v2/account",
      "https://paper-api.alpaca.markets/v2/account",
    ]);
    expect(result).toMatchObject({
      profile: { accountId: "paper-account", displayName: "PA-PAPER" },
      metadata: { environment: "paper", apiBaseUrl: "https://paper-api.alpaca.markets" },
    });
  });

  it("executes market-data actions with OAuth bearer credentials", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://data.alpaca.markets/v2/stocks/bars?symbols=AAPL&timeframe=1Day");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer alpaca-oauth-token");
      return Response.json({ bars: { AAPL: [] } });
    });
    vi.stubGlobal("fetch", fetch);
    const context: ExecutionContext = { getCredential: async () => oauthCredential({ environment: "paper" }) };

    const result = await executors["alpaca.get_stock_bars"]!({ symbols: ["AAPL"], timeframe: "1Day" }, context);

    expect(result).toMatchObject({ ok: true, output: { bars: { AAPL: [] } } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("uses OAuth bearer credentials for paper Trading API proxy requests", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://paper-api.alpaca.markets/v2/account");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer alpaca-oauth-token");
      expect(headers.get("apca-api-secret-key")).toBeNull();
      return Response.json({ id: "paper-account" });
    });
    vi.stubGlobal("fetch", fetch);
    const context: ExecutionContext = { getCredential: async () => oauthCredential({ environment: "paper" }) };

    const result = await proxy!({ endpoint: "/v2/account", method: "GET" }, context);

    expect(result).toMatchObject({ ok: true, response: { status: 200, data: { id: "paper-account" } } });
  });

  it("keeps API key validation on Alpaca's key-pair headers", async () => {
    await credentialValidators.apiKey!(
      { apiKey: "secret", values: { apiKeyId: "key-id", environment: "paper" } },
      {
        fetcher: async (_url, init) => {
          const headers = new Headers(init?.headers);
          expect(headers.get("apca-api-key-id")).toBe("key-id");
          expect(headers.get("apca-api-secret-key")).toBe("secret");
          expect(headers.get("authorization")).toBeNull();
          return Response.json({ id: "paper-account" });
        },
      },
    );
  });
});

function oauthCredential(
  metadata: Record<string, unknown> = { scope: "data" },
): Extract<ResolvedCredential, { authType: "oauth2" }> {
  return {
    authType: "oauth2",
    accessToken: "alpaca-oauth-token",
    tokenType: "Bearer",
    profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
    metadata,
  };
}
