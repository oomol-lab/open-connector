import type { IConnectionStore, StoredConnection } from "./connection-service.ts";
import type { ActionExecutor, CredentialValidators, ProviderDefinition, ResolvedCredential } from "./core/types.ts";
import type { MarketplaceService } from "./marketplace/marketplace-service.ts";
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

const catalogOnlyProvider: ProviderDefinition = {
  ...customCredentialProvider,
  service: "catalog_only",
  displayName: "Catalog Only",
  actions: [
    {
      id: "catalog_only.query",
      service: "catalog_only",
      name: "query",
      description: "Query the catalog-only provider.",
      requiredScopes: [],
      providerPermissions: [],
      inputSchema: {},
      outputSchema: {},
    },
  ],
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
  it("rejects connections for providers unavailable in the current runtime", async () => {
    const service = createService([catalogOnlyProvider]);

    await expect(
      service.connectWithCustomCredential("catalog_only", {
        values: {
          host: "localhost",
          password: "secret",
        },
      }),
    ).rejects.toMatchObject({
      code: "provider_unavailable",
      message: "Catalog Only is not available in this runtime.",
    });

    await expect(service.listConnections()).resolves.toEqual([]);
  });

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

  // The listing puts the Marketplace entry after whatever already answers for the provider, and
  // only that first entry is the default one.
  it("orders Marketplace entries after stored and no_auth connections", async () => {
    const services = ["uptimerobot", "hackernews", "database"];
    const marketplace = {
      getSnapshot: () => ({
        definition: { id: "community", name: "Community", pricing: { model: "included" } },
        actionsByService: new Map(services.map((service) => [service, new Set([`${service}.example`])])),
      }),
      listProviderPreferences: async () =>
        services.map((service) => ({
          service,
          enabled: true,
          createdAt: "2026-08-27T00:00:00.000Z",
          updatedAt: "2026-08-27T00:00:00.000Z",
        })),
    } as unknown as MarketplaceService;
    const service = new ConnectionService({
      catalog: createCatalogStore([apiKeyProvider, hackernewsProvider, customCredentialProvider]),
      marketplace,
      providerLoader: new FakeProviderLoader(),
      store: new MemoryConnectionStore(),
    });
    await service.connectWithApiKey("uptimerobot", {
      values: {
        apiKey: "test-key",
        accountId: "account-1",
      },
    });

    const summaries = await service.listConnections();
    expect(summaries.map((summary) => [summary.service, summary.authType, summary.default])).toEqual([
      ["database", "marketplace", true],
      ["hackernews", "no_auth", true],
      ["hackernews", "marketplace", false],
      ["uptimerobot", "api_key", true],
      ["uptimerobot", "marketplace", false],
    ]);
    await expect(service.listConnectionsByService("uptimerobot")).resolves.toEqual(
      summaries.filter((summary) => summary.service === "uptimerobot"),
    );
  });

  it("derives an explicit Marketplace connection name from discovery metadata", async () => {
    const marketplace = {
      getSnapshot: () => ({
        definition: { id: "community" },
        actionsByService: new Map([["uptimerobot", new Set(["uptimerobot.status"])]]),
      }),
      listProviderPreferences: async () => [
        {
          service: "uptimerobot",
          enabled: true,
          createdAt: "2026-08-27T00:00:00.000Z",
          updatedAt: "2026-08-27T00:00:00.000Z",
        },
      ],
    } as unknown as MarketplaceService;
    const service = new ConnectionService({
      catalog: createCatalogStore([apiKeyProvider]),
      marketplace,
      providerLoader: new FakeProviderLoader(),
      store: new MemoryConnectionStore(),
    });

    await expect(service.getConnectionSummary("uptimerobot", "marketplace_community")).resolves.toMatchObject({
      id: "marketplace:community:uptimerobot",
      connectionName: "marketplace_community",
      authType: "marketplace",
    });
    await expect(service.getConnectionSummary("uptimerobot", "marketplace_oomol")).rejects.toMatchObject({
      code: "connection_not_found",
    });
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

  it("passes a receiver-safe fetcher to credential validators", async () => {
    let nativeFetchThis: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(function (this: unknown) {
        nativeFetchThis = this;
        if (this !== undefined) {
          throw new TypeError("Illegal invocation: function called with incorrect `this` reference");
        }
        return Promise.resolve(Response.json({ ok: true }));
      }),
    );
    const service = createService([apiKeyProvider], {
      providerLoader: new FakeProviderLoader({
        async apiKey(_input, { fetcher }) {
          const context = { fetcher };
          await context.fetcher("https://example.com/validate");
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
    ).resolves.toMatchObject({ service: "uptimerobot", configured: true });
    expect(nativeFetchThis).toBeUndefined();
  });

  it("propagates a request signal to credential validators and aborts them without storing the credential", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    let validationStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      validationStarted = resolve;
    });
    const service = createService([apiKeyProvider], {
      providerLoader: new FakeProviderLoader({
        async apiKey(_input, options) {
          receivedSignal = options.signal;
          validationStarted?.();
          await new Promise<void>((_resolve, reject) => {
            if (!options.signal) {
              reject(new Error("request signal missing"));
              return;
            }
            options.signal.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
          });
        },
      }),
    });

    const connectPromise = service.connectWithApiKey("uptimerobot", {
      values: {
        apiKey: "valid-key",
        accountId: "account-1",
      },
      signal: controller.signal,
    });
    await started;
    controller.abort();

    await expect(connectPromise).rejects.toMatchObject({
      code: "connection_cancelled",
      message: "Credential validation was cancelled.",
    });
    expect(receivedSignal).toBe(controller.signal);
    expect(receivedSignal?.aborted).toBe(true);
    await expect(service.getCredential("uptimerobot")).resolves.toBeUndefined();
  });

  it("does not load credential validators for an already cancelled connection request", async () => {
    const providerLoader = new FakeProviderLoader({
      async apiKey() {
        return {};
      },
    });
    const loadValidators = vi.spyOn(providerLoader, "loadCredentialValidators");
    const controller = new AbortController();
    controller.abort();
    const service = createService([apiKeyProvider], { providerLoader });

    await expect(
      service.connectWithApiKey("uptimerobot", {
        values: {
          apiKey: "valid-key",
          accountId: "account-1",
        },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: "connection_cancelled",
    });
    expect(loadValidators).not.toHaveBeenCalled();
    await expect(service.getCredential("uptimerobot")).resolves.toBeUndefined();
  });

  it("does not create a cancellation signal for callers that omit one", async () => {
    const service = createService([apiKeyProvider], {
      providerLoader: new FakeProviderLoader({
        async apiKey(_input, options) {
          expect(options.signal).toBeUndefined();
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
    ).resolves.toMatchObject({ service: "uptimerobot", configured: true });
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

  it("does not store OAuth credentials after a definitive provider rejection", async () => {
    const service = createService([oauthProvider], {
      providerLoader: new FakeProviderLoader({
        async oauth2() {
          return {
            rejection: {
              code: "professional_account_required",
              message: "A professional account is required.",
            },
          };
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
    ).rejects.toMatchObject({
      code: "professional_account_required",
      message: "A professional account is required.",
    });
    await expect(service.getCredential("example")).resolves.toBeUndefined();
  });

  it("does not store OAuth credentials when validation is cancelled", async () => {
    const controller = new AbortController();
    let validationStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      validationStarted = resolve;
    });
    const service = createService([oauthProvider], {
      providerLoader: new FakeProviderLoader({
        async oauth2(_input, options) {
          validationStarted?.();
          await new Promise<void>((_resolve, reject) => {
            options.signal?.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
          });
        },
      }),
    });

    const connectPromise = service.setOAuthCredential(
      "example",
      {
        authType: "oauth2",
        accessToken: "access-token",
        tokenType: "Bearer",
        profile: testProfile,
        metadata: {},
      },
      undefined,
      controller.signal,
    );
    await started;
    controller.abort();

    await expect(connectPromise).rejects.toMatchObject({
      code: "connection_cancelled",
    });
    await expect(service.getCredential("example")).resolves.toBeUndefined();
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
      credential: {
        authType: "oauth2",
        accessToken: "fresh-token",
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/oauth/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("shares an in-flight OAuth refresh across concurrent requests", async () => {
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
      metadata: {},
    });

    const fetcher = vi.fn(async () =>
      Response.json({
        access_token: "fresh-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const credentials = await Promise.all([service.getCredential("example"), service.getCredential("example")]);

    expect(credentials).toEqual([
      expect.objectContaining({ accessToken: "fresh-token" }),
      expect.objectContaining({ accessToken: "fresh-token" }),
    ]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not overwrite a connection recreated during OAuth refresh", async () => {
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
    const original = await store.set("example", "default", {
      authType: "oauth2",
      accessToken: "expired-token",
      tokenType: "Bearer",
      refreshToken: "refresh-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: {},
    });
    let markRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });
    let completeRefresh!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const response = new Promise<Response>((resolve) => {
          completeRefresh = resolve;
        });
        markRefreshStarted();
        return response;
      }),
    );

    const execution = service.resolveForExecution("example");
    await refreshStarted;
    await store.delete("example", "default");
    const recreated = await store.set("example", "default", {
      authType: "oauth2",
      accessToken: "replacement-token",
      tokenType: "Bearer",
      refreshToken: "replacement-refresh-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: {},
    });
    completeRefresh(
      Response.json({
        access_token: "stale-refreshed-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    );

    await expect(execution).rejects.toMatchObject({ code: "connection_not_found" });
    expect(recreated.id).not.toBe(original.id);
    await expect(store.get("example", "default")).resolves.toMatchObject({
      id: recreated.id,
      credential: { accessToken: "replacement-token" },
    });
  });

  it("refreshes a replaced connection independently without accepting the stale result", async () => {
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
    const original = await store.set("example", "default", {
      authType: "oauth2",
      accessToken: "expired-token",
      tokenType: "Bearer",
      refreshToken: "refresh-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: {},
    });
    let markOriginalRefreshStarted!: () => void;
    const originalRefreshStarted = new Promise<void>((resolve) => {
      markOriginalRefreshStarted = resolve;
    });
    let markReplacementRefreshStarted!: () => void;
    const replacementRefreshStarted = new Promise<void>((resolve) => {
      markReplacementRefreshStarted = resolve;
    });
    const completeRefreshes: Array<(response: Response) => void> = [];
    let refreshCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const refreshIndex = refreshCount++;
        const response = new Promise<Response>((resolve) => {
          completeRefreshes[refreshIndex] = resolve;
        });
        if (refreshIndex === 0) {
          markOriginalRefreshStarted();
        } else {
          markReplacementRefreshStarted();
        }
        return response;
      }),
    );

    const originalExecution = service.resolveForExecution("example");
    await originalRefreshStarted;
    const replaced = await store.set("example", "default", {
      authType: "oauth2",
      accessToken: "replacement-token",
      tokenType: "Bearer",
      refreshToken: "replacement-refresh-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: {},
    });
    const replacementExecution = service.resolveForExecution("example");
    await replacementRefreshStarted;
    expect(fetch).toHaveBeenCalledTimes(2);
    completeRefreshes[1]!(
      Response.json({
        access_token: "replacement-refreshed-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    );
    const current = await replacementExecution;
    await expect(current.getCredential("example")).resolves.toMatchObject({
      accessToken: "replacement-refreshed-token",
    });
    completeRefreshes[0]!(
      Response.json({
        access_token: "stale-refreshed-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    );

    await expect(originalExecution).rejects.toMatchObject({ code: "connection_not_found" });
    expect(replaced.id).toBe(original.id);
    expect(replaced.revision).not.toBe(original.revision);
    await expect(store.get("example", "default")).resolves.toMatchObject({
      id: replaced.id,
      credential: { accessToken: "replacement-refreshed-token" },
    });
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

  it("resolves the execution credential and summary from one connection snapshot", async () => {
    const store = new MemoryConnectionStore();
    const service = createService([apiKeyProvider], { store });
    const original = await store.set("uptimerobot", "default", {
      authType: "api_key",
      apiKey: "original-key",
      values: { apiKey: "original-key", accountId: "account-1" },
      profile: testProfile,
      metadata: {},
    });

    const resolved = await service.resolveForExecution("uptimerobot");
    const updated = await store.set("uptimerobot", "default", {
      authType: "api_key",
      apiKey: "replacement-key",
      values: { apiKey: "replacement-key", accountId: "account-2" },
      profile: { ...testProfile, accountId: "replacement" },
      metadata: {},
    });

    expect(updated.id).toBe(original.id);
    expect(resolved.summary?.id).toBe(original.id);
    await expect(resolved.getCredential("uptimerobot")).resolves.toMatchObject({
      apiKey: "original-key",
      profile: { accountId: "example-account" },
    });
  });

  it("resolves each service credential once per forConnection scope", async () => {
    const store = new MemoryConnectionStore();
    const service = createService([apiKeyProvider, customCredentialProvider], { store });
    await store.set("uptimerobot", "default", {
      authType: "api_key",
      apiKey: "monitor-key",
      values: { apiKey: "monitor-key", accountId: "account-1" },
      profile: testProfile,
      metadata: {},
    });
    await store.set("database", "default", {
      authType: "custom_credential",
      values: { host: "db.example.com", password: "secret" },
      profile: testProfile,
      metadata: {},
    });
    const get = vi.spyOn(store, "get");

    const connection = service.forConnection();
    await expect(connection.getCredential("uptimerobot")).resolves.toMatchObject({ apiKey: "monitor-key" });
    await expect(connection.getCredential("uptimerobot")).resolves.toMatchObject({ apiKey: "monitor-key" });
    expect(get).toHaveBeenCalledTimes(1);

    await expect(connection.getCredential("database")).resolves.toMatchObject({
      values: { host: "db.example.com" },
    });
    expect(get).toHaveBeenCalledTimes(2);

    // A fresh scope is a fresh request: it must read the store again rather than serve a stale credential.
    await expect(service.forConnection().getCredential("uptimerobot")).resolves.toMatchObject({
      apiKey: "monitor-key",
    });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("replays a failed credential resolution without reading the store again", async () => {
    const store = new MemoryConnectionStore();
    const service = createService([apiKeyProvider], { store });
    const get = vi.spyOn(store, "get");

    const connection = service.forConnection("missing");
    const first = await connection.getCredential("uptimerobot").catch((error: unknown) => error);
    const second = await connection.getCredential("uptimerobot").catch((error: unknown) => error);

    expect(first).toMatchObject({ code: "connection_not_found" });
    expect(second).toBe(first);
    expect(get).toHaveBeenCalledTimes(1);
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
  private readonly store = new Map<string, StoredConnection>();

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    return this.store.get(createConnectionKey(service, connectionName));
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredConnection> {
    const key = createConnectionKey(service, connectionName);
    const connection = {
      id: this.store.get(key)?.id ?? crypto.randomUUID(),
      revision: crypto.randomUUID(),
      service,
      connectionName,
      credential,
    };
    this.store.set(key, connection);
    return connection;
  }

  async updateCredential(input: StoredConnection): Promise<boolean> {
    const key = createConnectionKey(input.service, input.connectionName);
    const current = this.store.get(key);
    if (current?.id !== input.id || current.revision !== input.revision) return false;
    this.store.set(key, { ...input, revision: crypto.randomUUID() });
    return true;
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.store.delete(createConnectionKey(service, connectionName));
  }

  async list(): Promise<StoredConnection[]> {
    return [...this.store.values()];
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
