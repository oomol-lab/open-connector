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

  it("reports missing client inputs consistently with validation and hides saved secrets", async () => {
    const provider = oauthProvider("public-client");
    const auth = provider.auth[0]!;
    if (auth.type !== "oauth2") throw new Error("Expected OAuth fixture");
    auth.tokenEndpointAuthMethod = "none";
    auth.clientConfigFields = [
      { key: "tenant", label: "Tenant", inputType: "text", required: true, secret: false, defaultValue: "common" },
      {
        key: "appToken",
        label: "App token",
        inputType: "password",
        required: true,
        secret: true,
        location: "secretExtra",
      },
    ];
    const service = new OAuthClientConfigService({
      catalog: createCatalogStore([provider]),
      origin: "https://host.example/connector",
      store: new MemoryOAuthClientConfigStore(),
    });
    const initial = await service.getSummary(provider.service);
    expect(initial.missingFields).toEqual(["clientId", "appToken"]);
    expect(initial.expectedRedirectUri).toBe("https://host.example/connector/oauth/callback");
    await expect(
      service.upsertConfig({ service: provider.service, clientId: "client", clientSecret: "" }),
    ).rejects.toThrow("appToken is required");
    const saved = await service.upsertConfig({
      service: provider.service,
      clientId: "client",
      clientSecret: "",
      secretExtra: { appToken: "saved-secret" },
    });
    expect(saved.missingFields).toEqual([]);
    expect(saved.extra).toEqual({ tenant: "common" });
    expect(JSON.stringify(saved)).not.toContain("saved-secret");
  });

  it("reports a required secretExtra field as missing on a stored config that predates secretExtra", async () => {
    const provider = oauthProvider("legacy");
    const auth = provider.auth[0]!;
    if (auth.type !== "oauth2") throw new Error("Expected OAuth fixture");
    auth.clientConfigFields = [
      {
        key: "developerToken",
        label: "Developer token",
        inputType: "password",
        required: true,
        secret: true,
        location: "secretExtra",
      },
    ];
    const store = new MemoryOAuthClientConfigStore();
    await store.set({
      service: provider.service,
      clientId: "client",
      clientSecret: "secret",
      extra: {},
    } as OAuthClientConfig);
    const service = new OAuthClientConfigService({
      catalog: createCatalogStore([provider]),
      origin: "http://localhost:3000",
      store,
    });
    expect((await service.getSummary(provider.service)).missingFields).toEqual(["developerToken"]);
    expect((await service.listConfigs()).map((config) => config.missingFields)).toEqual([["developerToken"]]);
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
    ).toThrow("requestedScopes contains a scope not declared by example: admin.");
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
    ).toThrow("requestedScopes must contain at least one scope.");
  });

  // A provider whose OAuth app is registered with a native app's custom URL
  // scheme (RFC 8252 §7.1) carries that redirect per provider.
  // `expectedRedirectUri` mirrors `effectiveScopes` (the value the flow sends),
  // `redirectUri` mirrors `requestedScopes` (the configured override, or null).
  it("carries a per-provider redirect URI override on the summary and the expected redirect", async () => {
    const service = new OAuthClientConfigService({
      catalog: createCatalogStore([oauthProvider("custom_scheme"), oauthProvider("other")]),
      origin: "http://localhost:8797",
      store: new MemoryOAuthClientConfigStore(),
    });

    const saved = await service.upsertConfig({
      service: "custom_scheme",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: " app://oauth/callback ",
    });
    expect(saved).toMatchObject({
      redirectUri: "app://oauth/callback",
      expectedRedirectUri: "app://oauth/callback",
    });
    const config = await service.getConfig("custom_scheme");
    expect(config).toMatchObject({ redirectUri: "app://oauth/callback" });
    expect(service.expectedRedirectUri("custom_scheme", config)).toBe("app://oauth/callback");
    // Without the config in hand the runtime callback answers, exactly as before.
    expect(service.expectedRedirectUri("custom_scheme")).toBe("http://localhost:8797/oauth/callback");

    await service.upsertConfig({ service: "other", clientId: "client-id", clientSecret: "client-secret" });
    await expect(service.getSummary("other")).resolves.toMatchObject({
      redirectUri: null,
      expectedRedirectUri: "http://localhost:8797/oauth/callback",
    });
    await expect(service.listConfigs()).resolves.toMatchObject([
      {
        service: "custom_scheme",
        redirectUri: "app://oauth/callback",
        expectedRedirectUri: "app://oauth/callback",
      },
      { service: "other", redirectUri: null, expectedRedirectUri: "http://localhost:8797/oauth/callback" },
    ]);

    // A blank override is "unset": the runtime callback is back.
    await service.upsertConfig({
      service: "custom_scheme",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "  ",
    });
    await expect(service.getSummary("custom_scheme")).resolves.toMatchObject({
      redirectUri: null,
      expectedRedirectUri: "http://localhost:8797/oauth/callback",
    });
  });

  it("answers the runtime callback for a stored config that predates redirectUri", async () => {
    const store = new MemoryOAuthClientConfigStore();
    await store.set({
      service: "legacy",
      clientId: "client",
      clientSecret: "secret",
      extra: {},
      secretExtra: {},
    });
    const service = new OAuthClientConfigService({
      catalog: createCatalogStore([oauthProvider("legacy")]),
      origin: "http://localhost:8797",
      store,
    });

    await expect(service.getSummary("legacy")).resolves.toMatchObject({
      configured: true,
      redirectUri: null,
      expectedRedirectUri: "http://localhost:8797/oauth/callback",
    });
    expect(service.expectedRedirectUri("legacy", await service.getConfig("legacy"))).toBe(
      "http://localhost:8797/oauth/callback",
    );
  });

  it.each([
    ["a relative path", "oauth/callback"],
    ["not a URL", "not a url"],
    ["carrying user info", "app://user:secret@oauth/callback"],
    ["carrying a fragment", "http://localhost:8797/oauth/callback#fragment"],
  ])("rejects a redirect URI override that is %s", (_case, redirectUri) => {
    const service = new OAuthClientConfigService({
      catalog: createCatalogStore([oauthProvider("example")]),
      origin: "http://localhost:8797",
      store: new MemoryOAuthClientConfigStore(),
    });

    expect(() =>
      service.normalizeConfig("example", {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri,
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_input", message: "redirectUri must be an absolute URL." }));
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
