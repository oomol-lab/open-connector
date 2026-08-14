import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

const account = {
  id: "acct_123",
  email: "owner@example.com",
  country: "US",
  default_currency: "usd",
};

describe("Stripe credentials", () => {
  it("validates a Stripe Connect OAuth credential with bearer authentication", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "sk_live_connected",
        tokenType: "bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: { scope: "read_write", stripe_user_id: "acct_123" },
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.stripe.com/v1/account");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk_live_connected");
          return Response.json(account);
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "acct_123", displayName: "owner@example.com" },
      grantedScopes: ["read_write"],
      metadata: { accountId: "acct_123", country: "US", defaultCurrency: "usd" },
    });
  });

  it("keeps secret API key validation compatible", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "sk_test_platform", values: {} },
      {
        fetcher: async (_url, init) => {
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk_test_platform");
          return Response.json(account);
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "acct_123", displayName: "owner@example.com" },
      grantedScopes: [],
    });
  });
});
