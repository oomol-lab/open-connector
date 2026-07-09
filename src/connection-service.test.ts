import type { IConnectionStore, StoredConnection } from "./connection-service.ts";
import type { ActionExecutor, CredentialValidators, ProviderDefinition, ResolvedCredential } from "./core/types.ts";
import type { OAuthClientConfig } from "./oauth/oauth-client-config-service.ts";
import type { IProviderLoader } from "./providers/provider-loader.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "./catalog-store.ts";
import { ConnectionService } from "./connection-service.ts";
import { OAuthClientConfigService } from "./oauth/oauth-client-config-service.ts";
import { OAuthCredentialRefreshService } from "./oauth/oauth-credential-refresh-service.ts";

const hackernewsProvider: ProviderDefinition = {
  service: "hackernews",
  displayName: "Hacker News",
  categories: ["Social"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  actions: [],
};

const apiKeyProvider: ProviderDefinition = {
  service: "uptimerobot",
  displayName: "UptimeRobot",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      extraFields: [
        {
          key: "accountId",
          label: "Account ID",
          inputType: "text",
          required: true,
          secret: false,
        },
      ],
    },
  ],
  actions: [],
};

const customCredentialProvider: ProviderDefinition = {
  service: "database",
  displayName: "Database",
  categories: ["Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "host",
          label: "Host",
          inputType: "text",
          required: true,
          secret: false,
        },
        {
          key: "password",
          label: "Password",
          inputType: "password",
          required: true,
          secret: true,
        },
      ],
    },
  ],
  actions: [],
};

const oauthProvider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
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

const oauthRefreshProvider: ProviderDefinition = {
  ...oauthProvider,
  service: "refresh_example",
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://example.com/oauth/authorize",
      tokenUrl: "https://example.com/oauth/token",
      refreshTokenUrl: "https://example.com/oauth/refresh",
      scopes: ["read"],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
};

const testProfile = {
  accountId: "example-account",
  displayName: "Example Account",
  grantedScopes: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ConnectionService", () => {
  it("exposes no_auth providers as virtual connections", async () => {
    const service = createService([hackernewsProvider]);

    await expect(service.getCredential("hackernews")).resolves.toEqual({ authType: "no_auth" });
    await expect(service.listConnections()).resolves.toEqual([
      {
        id: "hackernews:default",
        service: "hackernews",
        connectionName: "default",
        authType: "no_auth",
        configured: true,
        virtual: true,
        default: true,
        profile: {
          accountId: "hackernews:public",
          displayName: "Hacker News Public",
          grantedScopes: [],
        },
      },
    ]);
  });

  it("stores API key credentials as resolved credentials", async () => {
    const service = createService([apiKeyProvider]);

    await service.connectWithApiKey("uptimerobot", {
      values: {
        apiKey: " test-key ",
        accountId: " account-1 ",
      },
    });

    await expect(service.getCredential("uptimerobot")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "test-key",
      values: {
        apiKey: "test-key",
        accountId: "account-1",
      },
    });
  });

  it("requires declared API key extra fields", async () => {
    const service = createService([apiKeyProvider]);

    await expect(
      service.connectWithApiKey("uptimerobot", {
        values: {
          apiKey: "test-key",
        },
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "accountId is required.",
    });
  });

  it("rejects undeclared API key fields", async () => {
    const service = createService([apiKeyProvider]);

    await expect(
      service.connectWithApiKey("uptimerobot", {
        values: {
          apiKey: "test-key",
          accountId: "account-1",
          region: "us",
        },
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "Unexpected credential field: region.",
    });
  });

  it("requires declared custom credential fields", async () => {
    const service = createService([customCredentialProvider]);

    await expect(
      service.connectWithCustomCredential("database", {
        values: {
          host: "localhost",
        },
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "password is required.",
    });
  });

  it("stores custom credential values after trimming declared fields", async () => {
    const service = createService([customCredentialProvider]);

    await service.connectWithCustomCredential("database", {
      values: {
        host: " localhost ",
        password: " secret ",
      },
    });

    await expect(service.getCredential("database")).resolves.toMatchObject({
      authType: "custom_credential",
      values: {
        host: "localhost",
        password: "secret",
      },
    });
  });

  it("verifies credentials before storing them when a provider exposes a validator", async () => {
    const validators: CredentialValidators = {
      async apiKey(input) {
        if (input.apiKey !== "valid-key") {
          throw new Error("invalid key");
        }
        return {
          profile: {
            accountId: "uptimerobot:user:1",
            displayName: "Ops",
            grantedScopes: ["read"],
          },
          metadata: { checked: true },
        };
      },
    };
    const service = createService([apiKeyProvider], {
      providerLoader: new FakeProviderLoader(validators),
    });

    await expect(
      service.connectWithApiKey("uptimerobot", {
        values: {
          apiKey: "bad-key",
          accountId: "account-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "credential_verification_failed",
      message: "invalid key",
    });
    await expect(service.getCredential("uptimerobot")).resolves.toBeUndefined();

    await service.connectWithApiKey("uptimerobot", {
      values: {
        apiKey: "valid-key",
        accountId: "account-1",
      },
    });
    await expect(service.getCredential("uptimerobot")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "valid-key",
      profile: {
        accountId: "uptimerobot:user:1",
        displayName: "Ops",
        grantedScopes: ["read"],
      },
      metadata: { checked: true },
    });
  });

  it("passes the runtime logger to credential validators", async () => {
    const logger = createTestLogger();
    const validators: CredentialValidators = {
      async apiKey(_input, options) {
        options.logger?.info({ service: "uptimerobot" }, "validator log");
      },
    };
    const service = createService([apiKeyProvider], {
      logger,
      providerLoader: new FakeProviderLoader(validators),
    });

    await service.connectWithApiKey("uptimerobot", {
      values: {
        apiKey: "valid-key",
        accountId: "account-1",
      },
    });

    expect(logger.info).toHaveBeenCalledWith({ service: "uptimerobot" }, "validator log");
  });

  it("exposes connection profiles to local users and agents", async () => {
    const service = createService([apiKeyProvider], {
      providerLoader: new FakeProviderLoader({
        async apiKey() {
          return {
            profile: {
              accountId: "ops@example.com",
              displayName: "Ops",
              grantedScopes: ["read", "write"],
            },
          };
        },
      }),
    });

    await expect(
      service.connectWithApiKey("uptimerobot", {
        values: {
          apiKey: "valid-key",
          accountId: "account-1",
        },
      }),
    ).resolves.toMatchObject({
      service: "uptimerobot",
      profile: {
        accountId: "ops@example.com",
        displayName: "Ops",
        grantedScopes: ["read", "write"],
      },
    });
    await expect(service.listConnections()).resolves.toMatchObject([
      {
        service: "uptimerobot",
        profile: {
          accountId: "ops@example.com",
          displayName: "Ops",
          grantedScopes: ["read", "write"],
        },
      },
    ]);
  });

  it("stores OAuth credentials when profile validation fails", async () => {
    const service = createService([oauthProvider], {
      providerLoader: new FakeProviderLoader({
        async oauth2() {
          throw new Error("gmail request failed with 403");
        },
      }),
    });

    await expect(
      service.setOAuthCredential("example", {
        authType: "oauth2",
        accessToken: "access-token",
        tokenType: "Bearer",
        profile: testProfile,
        metadata: {},
      }),
    ).resolves.toMatchObject({
      service: "example",
      authType: "oauth2",
      configured: true,
      profile: testProfile,
    });
    await expect(service.getCredential("example")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "access-token",
    });
  });

  it("refreshes expired OAuth credentials before returning them", async () => {
    const store = new MemoryConnectionStore();
    const oauthClientConfigs = createOAuthClientConfigs([oauthProvider]);
    const service = createService([oauthProvider], {
      oauthCredentials: new OAuthCredentialRefreshService(oauthClientConfigs),
      store,
    });
    await oauthClientConfigs.upsertConfig({
      service: "example",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    await store.set("example", "default", {
      authType: "oauth2",
      accessToken: "expired-token",
      tokenType: "Bearer",
      refreshToken: "refresh-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: { original: true },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "fresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "read",
        }),
      ),
    );

    await expect(service.getCredential("example")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "fresh-token",
      refreshToken: "refresh-token",
      metadata: {
        original: true,
        scope: "read",
      },
    });
    await expect(store.get("example", "default")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "fresh-token",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/oauth/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("uses provider refresh token URLs when refreshing expired OAuth credentials", async () => {
    const store = new MemoryConnectionStore();
    const oauthClientConfigs = createOAuthClientConfigs([oauthRefreshProvider]);
    const service = createService([oauthRefreshProvider], {
      oauthCredentials: new OAuthCredentialRefreshService(oauthClientConfigs),
      store,
    });
    await oauthClientConfigs.upsertConfig({
      service: "refresh_example",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    await store.set("refresh_example", "default", {
      authType: "oauth2",
      accessToken: "expired-token",
      tokenType: "Bearer",
      refreshToken: "refresh-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          access_token: "fresh-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      ),
    );

    await expect(service.getCredential("refresh_example")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "fresh-token",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/oauth/refresh",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("asks users to reconnect when an expired OAuth credential has no refresh token", async () => {
    const store = new MemoryConnectionStore();
    const service = createService([oauthProvider], { store });
    await store.set("example", "default", {
      authType: "oauth2",
      accessToken: "expired-token",
      tokenType: "Bearer",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: {},
    });

    await expect(service.getCredential("example")).rejects.toMatchObject({
      code: "oauth_token_expired",
    });
  });
});

interface CreateServiceOptions {
  logger?: ReturnType<typeof createTestLogger>;
  oauthCredentials?: OAuthCredentialRefreshService;
  providerLoader?: IProviderLoader;
  store?: MemoryConnectionStore;
}

function createService(providers: ProviderDefinition[], options: CreateServiceOptions = {}): ConnectionService {
  const catalog = createCatalogStore(providers);

  return new ConnectionService({
    catalog,
    logger: options.logger,
    oauthCredentials: options.oauthCredentials,
    providerLoader: options.providerLoader ?? new FakeProviderLoader(),
    store: options.store ?? new MemoryConnectionStore(),
  });
}

function createTestLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

function createOAuthClientConfigs(providers: ProviderDefinition[]): OAuthClientConfigService {
  return new OAuthClientConfigService({
    catalog: createCatalogStore(providers),
    origin: "http://localhost:3000",
    store: new MemoryOAuthClientConfigStore(),
  });
}

class FakeProviderLoader implements IProviderLoader {
  private readonly validators?: CredentialValidators;

  constructor(validators?: CredentialValidators) {
    this.validators = validators;
  }

  async loadActionExecutor(_service: string, _actionId: string): Promise<ActionExecutor | undefined> {
    return undefined;
  }

  async loadProxyExecutor(): Promise<undefined> {
    return undefined;
  }

  async loadCredentialValidators(_service: string): Promise<CredentialValidators | undefined> {
    return this.validators;
  }
}

class MemoryConnectionStore implements IConnectionStore {
  private readonly store = new Map<string, ResolvedCredential>();

  async get(service: string, connectionName: string): Promise<ResolvedCredential | undefined> {
    return this.store.get(createConnectionKey(service, connectionName));
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<void> {
    this.store.set(createConnectionKey(service, connectionName), credential);
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.store.delete(createConnectionKey(service, connectionName));
  }

  async list(): Promise<StoredConnection[]> {
    return [...this.store.entries()].map(([key, credential]) => {
      const [service, connectionName] = key.split(":");
      return {
        service: service!,
        connectionName: connectionName!,
        credential,
      };
    });
  }
}

function createConnectionKey(service: string, connectionName: string): string {
  return `${service}:${connectionName}`;
}

class MemoryOAuthClientConfigStore {
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
