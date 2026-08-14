import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

function shopifyCredentialFetcher(expectedToken: string): typeof fetch {
  return async (url, init) => {
    const requestUrl = new URL(url.toString());
    expect(requestUrl.origin).toBe("https://acme.myshopify.com");
    expect(new Headers(init?.headers).get("x-shopify-access-token")).toBe(expectedToken);
    if (requestUrl.pathname.endsWith("/shop.json")) {
      return Response.json({
        shop: {
          id: 123,
          name: "Acme Store",
          myshopify_domain: "acme.myshopify.com",
        },
      });
    }
    expect(requestUrl.pathname).toMatch(/\/blogs\/count\.json$/u);
    return Response.json({ count: 1 });
  };
}

describe("Shopify credentials", () => {
  it("validates OAuth credentials against the configured shop", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "shopify-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {
          scope: "read_content",
          oauthClientExtra: { shopDomain: "acme.myshopify.com" },
        },
      },
      { fetcher: shopifyCredentialFetcher("shopify-oauth-token") },
    );

    expect(result).toMatchObject({
      profile: { accountId: "shopify:acme.myshopify.com", displayName: "Acme Store" },
      grantedScopes: ["read_content"],
      metadata: {
        apiBaseUrl: "https://acme.myshopify.com/admin/api/2026-04",
        shopDomain: "acme.myshopify.com",
        shopId: 123,
      },
    });
  });

  it("keeps custom-app access token validation compatible", async () => {
    const result = await credentialValidators.apiKey!(
      {
        apiKey: "shpat_custom_token",
        values: { shopDomain: "https://acme.myshopify.com/admin" },
      },
      { fetcher: shopifyCredentialFetcher("shpat_custom_token") },
    );

    expect(result).toMatchObject({
      profile: { displayName: "Acme Store" },
      grantedScopes: ["read_content"],
    });
  });
});
