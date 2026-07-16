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
        scopes: ["read"],
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
