import type { IOAuthClientConfigStore } from "../../oauth/oauth-client-config-service.ts";

import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import { provider } from "./definition.ts";
import { credentialValidators } from "./executors.ts";

const oauthConfigStore: IOAuthClientConfigStore = {
  async get() {
    return undefined;
  },
  async set() {},
  async delete() {},
  async list() {
    return [];
  },
};

function shopifyCredentialFetcher(expectedToken: string): typeof fetch {
  return async (url, init) => {
    const requestUrl = new URL(url.toString());
    expect(requestUrl.origin).toBe("https://acme.myshopify.com");
    expect(new Headers(init?.headers).get("x-shopify-access-token")).toBe(expectedToken);
    expect(requestUrl.pathname.endsWith("/shop.json")).toBe(true);
    return Response.json({
      shop: {
        id: 123,
        name: "Acme Store",
        myshopify_domain: "acme.myshopify.com",
      },
    });
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
          oauthClientExtra: { shopSubdomain: "acme" },
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

  it("keeps every resolved OAuth endpoint under myshopify.com", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");
    if (!oauth || oauth.type !== "oauth2") {
      throw new Error("expected Shopify OAuth definition");
    }
    const clientConfigs = new OAuthClientConfigService({
      catalog: createCatalogStore([provider]),
      origin: "http://localhost:3000",
      store: oauthConfigStore,
    });
    const config = clientConfigs.normalizeConfig("shopify", {
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: { shopSubdomain: "acme" },
    });

    expect(new URL(clientConfigs.resolveEndpointUrl("shopify", oauth.authorizationUrl, config)).origin).toBe(
      "https://acme.myshopify.com",
    );
    expect(new URL(clientConfigs.resolveEndpointUrl("shopify", oauth.tokenUrl, config)).origin).toBe(
      "https://acme.myshopify.com",
    );

    expect(() =>
      clientConfigs.resolveEndpointUrl("shopify", oauth.tokenUrl, {
        ...config,
        extra: { shopSubdomain: "attacker.example/evil" },
      }),
    ).toThrow();
  });
});
