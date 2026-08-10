import type { ProviderDefinition } from "../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "./oauth-client-config-service.ts";

import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { OAuthClientConfigService } from "./oauth-client-config-service.ts";

describe("OAuthClientConfigService", () => {
  it("lists configured OAuth clients before unconfigured OAuth providers", async () => {
    const store = new MemoryOAuthClientConfigStore();
    await store.set({
      service: "beta",
      clientId: "beta-client-id",
      clientSecret: "beta-client-secret",
      extra: {},
      secretExtra: {},
    });
    const service = new OAuthClientConfigService({
      catalog: createCatalogStore([oauthProvider("alpha"), oauthProvider("beta"), noAuthProvider]),
      origin: "http://localhost:3000",
      store,
    });

    await expect(service.listConfigs()).resolves.toMatchObject([
      { service: "beta", configured: true, clientId: "beta-client-id" },
      { service: "alpha", configured: false, clientId: null },
    ]);
  });

  it("normalizes a requested scope subset and rejects provider-undeclared scopes", () => {
    const service = new OAuthClientConfigService({
      catalog: createCatalogStore([oauthProvider("example")]),
      origin: "http://localhost:3000",
      store: new MemoryOAuthClientConfigStore(),
    });

    expect(
      service.normalizeConfig("example", {
        clientId: "client-id",
        clientSecret: "client-secret",
        requestedScopes: [" write ", "read", "write"],
      }),
    ).toMatchObject({ requestedScopes: ["write", "read"] });

    expect(() =>
      service.normalizeConfig("example", {
        clientId: "client-id",
        clientSecret: "client-secret",
        requestedScopes: ["admin"],
      }),
    ).toThrowError("requestedScopes contains a scope not declared by example: admin.");
  });

  it("drops stored scopes the provider no longer declares instead of failing reads", async () => {
    const store = new MemoryOAuthClientConfigStore();
    await store.set({
      service: "example",
      clientId: "client-id",
      clientSecret: "client-secret",
      requestedScopes: ["read", "removed"],
      extra: {},
      secretExtra: {},
    });
    const service = new OAuthClientConfigService({
      catalog: createCatalogStore([oauthProvider("example")]),
      origin: "http://localhost:3000",
      store,
    });

    await expect(service.listConfigs()).resolves.toMatchObject([
      { service: "example", requestedScopes: ["read", "removed"], effectiveScopes: ["read"] },
    ]);
    expect(
      service.getEffectiveScopes("example", {
        service: "example",
        clientId: "client-id",
        clientSecret: "client-secret",
        requestedScopes: ["removed"],
        extra: {},
        secretExtra: {},
      }),
    ).toEqual(["read", "write"]);
  });

  it("rejects an empty requested scope subset", () => {
    const service = new OAuthClientConfigService({
      catalog: createCatalogStore([oauthProvider("example")]),
      origin: "http://localhost:3000",
      store: new MemoryOAuthClientConfigStore(),
    });

    expect(() =>
      service.normalizeConfig("example", {
        clientId: "client-id",
        clientSecret: "client-secret",
        requestedScopes: [],
      }),
    ).toThrowError("requestedScopes must contain at least one scope.");
  });
});

function oauthProvider(service: string): ProviderDefinition {
  return {
    service,
    displayName: service,
    categories: ["Developer Tools"],
    authTypes: ["oauth2"],
    auth: [
      {
        type: "oauth2",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token",
        scopes: ["read", "write"],
        tokenEndpointAuthMethod: "client_secret_post",
      },
    ],
    actions: [],
  };
}

const noAuthProvider: ProviderDefinition = {
  service: "public",
  displayName: "public",
  categories: ["Developer Tools"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  actions: [],
};

class MemoryOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly configs = new Map<string, OAuthClientConfig>();

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    return this.configs.get(service);
  }

  async set(config: OAuthClientConfig): Promise<void> {
    this.configs.set(config.service, config);
  }

  async delete(service: string): Promise<void> {
    this.configs.delete(service);
  }

  async list(): Promise<OAuthClientConfig[]> {
    return [...this.configs.values()];
  }
}
