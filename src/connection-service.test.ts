import type { IConnectionStore, StoredConnection } from "./connection-service.ts";
import type { ProviderHttpAttempt, ProviderHttpDispatchOptions } from "./core/provider-http-dispatch.ts";
import type { ActionExecutor, CredentialValidators, ProviderDefinition, ResolvedCredential } from "./core/types.ts";
import type { MarketplaceService } from "./marketplace/marketplace-service.ts";
import type { OAuthClientConfig } from "./oauth/oauth-client-config-service.ts";
import type { IOAuthCredentialRefresher } from "./oauth/oauth-credential-refresh-service.ts";
import type { IProviderLoader } from "./providers/provider-loader.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "./catalog-store.ts";
import { ConnectionError, ConnectionService } from "./connection-service.ts";
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
      operationType: "read",
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

  it("does not store OAuth credentials when profile validation fails", async () => {
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
    ).rejects.toMatchObject({
      code: "credential_verification_failed",
      message: "gmail request failed with 403",
    });
    await expect(service.getCredential("example")).resolves.toBeUndefined();
    await expect(service.listConnections()).resolves.toEqual([]);
  });

  // Credential metadata also holds client secrets and provider-private data.
  // The summary is a public shape, so this asserts the WHOLE object rather
  // than the one new key: a test that only checks `oauthAuthorizationId` is
  // present would pass just as happily if a client secret leaked beside it.
  it("exposes only the OAuth provenance out of internal credential metadata", async () => {
    const service = createService([oauthProvider]);
    const summary = await service.setOAuthCredential(
      "example",
      {
        authType: "oauth2",
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        tokenType: "Bearer",
        profile: testProfile,
        metadata: {
          oauthAuthorizationId: "completed-authorization",
          oauthClientConfig: { clientId: "test-client", clientSecret: "test-client-secret" },
          oauthClientSecretExtra: { appBearerToken: "test-app-token" },
          providerData: "internal-only",
        },
      },
      "work",
    );
    const expected = {
      id: summary.id,
      service: "example",
      connectionName: "work",
      authType: "oauth2",
      configured: true,
      status: "active",
      virtual: false,
      default: false,
      profile: testProfile,
      oauthAuthorizationId: "completed-authorization",
    };

    // Every way a caller can reach a summary, because they are separate code
    // paths and a field added to one is not added to the others.
    expect(JSON.parse(JSON.stringify(summary))).toEqual(expected);
    expect(await service.getConnectionSummary("example", "work")).toEqual(expected);
    expect(await service.listConnections()).toEqual([expected]);
    expect(await service.listConnectionsByService("example")).toEqual([expected]);
    expect((await service.resolveForExecution("example", "work")).summary).toEqual(expected);
  });

  // Absent, not null or empty: a connection made before this existed has no
  // provenance, and "" would read as one. The validator case is the same
  // assertion from the other side — provenance is minted by the callback that
  // completed consent, so a provider validator must not be able to supply it.
  it.each([undefined, null, 42, { nested: "not-a-string" }])(
    "omits legacy or non-string provenance, and refuses validator-supplied provenance (%#)",
    async (oauthAuthorizationId) => {
      const service = createService([oauthProvider], {
        providerLoader: new FakeProviderLoader({
          async oauth2() {
            return { profile: testProfile, metadata: { oauthAuthorizationId: "validator-supplied-id" } };
          },
        }),
      });
      const summary = await service.setOAuthCredential("example", {
        authType: "oauth2",
        accessToken: "access-token",
        tokenType: "Bearer",
        profile: testProfile,
        metadata: { oauthAuthorizationId },
      });

      expect(summary).not.toHaveProperty("oauthAuthorizationId");
      expect(await service.getConnectionSummary("example")).not.toHaveProperty("oauthAuthorizationId");
    },
  );

  it("preserves the existing OAuth connection when reconnect validation fails", async () => {
    const validate = vi.fn().mockResolvedValue({ profile: testProfile });
    const service = createService([oauthProvider], {
      providerLoader: new FakeProviderLoader({ oauth2: validate }),
    });
    const credential: ResolvedCredential = {
      authType: "oauth2",
      accessToken: "original-token",
      tokenType: "Bearer",
      profile: testProfile,
      metadata: {},
    };
    const original = await service.setOAuthCredential("example", credential, "work");
    validate.mockRejectedValue(new Error("profile unavailable"));

    await expect(
      service.setOAuthCredential("example", { ...credential, accessToken: "replacement-token" }, "work"),
    ).rejects.toMatchObject({ code: "credential_verification_failed" });
    await expect(service.getCredential("example", "work")).resolves.toEqual({
      ...credential,
      metadata: { providerAccountVerified: true, oauthAuthorizationId: undefined },
    });
    await expect(service.listConnections()).resolves.toEqual([original]);
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

  it.each([
    [400, "invalid_grant", true],
    [401, "invalid_grant", true],
    [400, "invalid_client", false],
    [429, "invalid_grant", false],
    [503, "invalid_grant", false],
    [0, "network_failure", false],
  ])("reports the durable authorization state after a %s %s refresh refusal", async (status, errorCode, reauth) => {
    const store = new MemoryConnectionStore();
    const clientConfigs = createOAuthClientConfigs([oauthProvider]);
    await clientConfigs.upsertConfig({ service: "example", clientId: "client-id", clientSecret: "client-secret" });
    const service = createService([oauthProvider], {
      store,
      oauthCredentials: new OAuthCredentialRefreshService(clientConfigs),
    });
    const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
      authType: "oauth2",
      accessToken: "expired-token",
      tokenType: "Bearer",
      refreshToken: "refresh-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: {},
    };
    const stored = await store.set("example", "default", credential);
    const fetcher = vi.fn(async () => {
      if (!status) throw new Error("connection reset");
      return Response.json({ error: errorCode }, { status });
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(service.getCredential("example")).rejects.toMatchObject({
      code: reauth ? "oauth_reauth_required" : "oauth_token_refresh_failed",
    });
    await expect(service.listConnections()).resolves.toMatchObject([{ status: reauth ? "reauth_required" : "active" }]);
    await expect(service.getManagedConnection(stored.id)).resolves.toMatchObject({
      status: reauth ? "reauth_required" : "active",
    });
    if (reauth) {
      await expect(service.getCredential("example")).rejects.toMatchObject({ code: "oauth_reauth_required" });
      expect(fetcher).toHaveBeenCalledOnce();
      await service.setOAuthCredential("example", {
        ...credential,
        accessToken: "fresh-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
      });
      await expect(service.getManagedConnection(stored.id)).resolves.toMatchObject({ status: "active" });
      await expect(service.getCredential("example")).resolves.toMatchObject({ accessToken: "fresh-token" });
    }
  });

  it("does not mark a newer authorization when an old refresh is rejected", async () => {
    const store = new MemoryConnectionStore();
    const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
      authType: "oauth2",
      accessToken: "expired-token",
      tokenType: "Bearer",
      refreshToken: "refresh-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: {},
    };
    const original = await store.set("example", "default", credential);
    const service = createService([oauthProvider], {
      store,
      oauthCredentials: {
        refresh: async () => {
          await store.set("example", "default", { ...credential, accessToken: "replacement-token" });
          throw new ConnectionError("oauth_reauth_required", "Reconnect example.");
        },
      },
    });
    await expect(service.getCredential("example")).rejects.toMatchObject({ code: "oauth_reauth_required" });
    await expect(service.getManagedConnection(original.id)).resolves.toMatchObject({ status: "active" });
    await expect(store.get("example", "default")).resolves.toMatchObject({
      credential: { accessToken: "replacement-token", metadata: {} },
    });
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

  it("binds OAuth refresh to the resolved stored connection identity", async () => {
    const store = new MemoryConnectionStore();
    const oauthClientConfigs = createOAuthClientConfigs([oauthProvider]);
    const attempts: ProviderHttpAttempt[] = [];
    const service = createService([oauthProvider], {
      oauthCredentials: new OAuthCredentialRefreshService(oauthClientConfigs),
      store,
      providerHttpDispatch: {
        beforeAttempt: (attempt) => {
          attempts.push(attempt);
          return { allow: true };
        },
      },
    });
    await oauthClientConfigs.upsertConfig({
      service: "example",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    const original = await store.set("example", "binding-fixture", {
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
      vi.fn(async () => Response.json({ access_token: "fresh-token", expires_in: 3600, token_type: "Bearer" })),
    );
    const target = await service.resolveForExecution("example", undefined, original.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.context).toMatchObject({
      operation: "oauth",
      service: "example",
      connectionId: original.id,
      connectionName: "binding-fixture",
    });
    if (target.kind !== "local") throw new Error("Expected local connection");
    await expect(target.getCredential("example")).resolves.toMatchObject({ accessToken: "fresh-token" });
    expect(JSON.stringify(attempts)).not.toMatch(/expired-token|refresh-token|client-secret/);
  });

  it("keeps boolean-only adapter OAuth refresh working with admission configured", async () => {
    const memory = new MemoryConnectionStore();
    const store: IConnectionStore = {
      get: memory.get.bind(memory),
      getRetirementGeneration: memory.getRetirementGeneration.bind(memory),
      setIfCurrentGeneration: memory.setIfCurrentGeneration.bind(memory),
      set: memory.set.bind(memory),
      updateCredential: memory.updateCredential.bind(memory),
      delete: memory.delete.bind(memory),
      list: memory.list.bind(memory),
    };
    const expired = {
      authType: "oauth2" as const,
      accessToken: "expired-token",
      tokenType: "Bearer",
      refreshToken: "refresh-token",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: {},
    };
    const refresh = vi.fn(async () => ({ ...expired, accessToken: "fresh-token" }));
    await store.set("example", "default", expired);
    await expect(
      createService([oauthProvider], { store, oauthCredentials: { refresh } }).getCredential("example"),
    ).resolves.toMatchObject({ accessToken: "fresh-token" });
    expect(refresh).toHaveBeenCalledOnce();
    await store.set("example", "default", expired);
    const guarded = createService([oauthProvider], {
      store,
      oauthCredentials: { refresh },
      providerHttpDispatch: { beforeAttempt: () => ({ allow: true }) },
    });
    const target = await guarded.resolveForExecution("example");
    if (target.kind !== "local") throw new Error("Expected local connection");
    await expect(target.getCredential("example")).resolves.toMatchObject({ accessToken: "fresh-token" });
    expect(refresh).toHaveBeenCalledTimes(2);
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
    if (current.kind !== "local") throw new Error("Expected local connection");
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

  describe("rotating single-use refresh tokens", () => {
    const expiredRotating = {
      authType: "oauth2" as const,
      accessToken: "expired-token",
      tokenType: "Bearer",
      refreshToken: "refresh-token-1",
      expiresAt: "2026-01-01T00:00:00.000Z",
      profile: testProfile,
      metadata: { oauthAuthorizationId: "authorization-1" },
    };

    /** A refresher that rejects a spent refresh token, like Feishu/Lark, and can be held open. */
    function createRotatingRefresher() {
      const spent = new Set<string>();
      const pending: Array<() => void> = [];
      let started!: () => void;
      let startedPromise = new Promise<void>((resolve) => (started = resolve));
      let hold = true;
      const refresh = vi.fn(
        async (_service: string, credential: Extract<ResolvedCredential, { authType: "oauth2" }>) => {
          const token = credential.refreshToken!;
          if (spent.has(token)) throw new Error("The refresh token has been revoked.");
          spent.add(token);
          const generation = Number(token.split("-").at(-1)) + 1;
          started();
          if (hold) await new Promise<void>((resolve) => pending.push(resolve));
          return {
            ...credential,
            accessToken: `fresh-token-${generation}`,
            refreshToken: `refresh-token-${generation}`,
            expiresAt: "2099-01-01T00:00:00.000Z",
            metadata: { ...credential.metadata, refreshedAt: `generation-${generation}` },
          };
        },
      );
      return {
        refresh,
        started: () => startedPromise,
        release: () => {
          hold = false;
          for (const resolve of pending.splice(0)) resolve();
        },
        rearm: () => {
          hold = true;
          startedPromise = new Promise<void>((resolve) => (started = resolve));
        },
      };
    }

    async function bumpRevision(store: IConnectionStore, metadata: Record<string, unknown>) {
      const current = await store.get("example", "default");
      if (!current || current.source === "saas" || current.credential.authType !== "oauth2")
        throw new Error("Expected a local OAuth connection");
      expect(
        await store.updateCredential({
          ...current,
          credential: { ...current.credential, metadata: { ...current.credential.metadata, ...metadata } },
        }),
      ).toBe(true);
      return (await store.get("example", "default"))!;
    }

    it("persists the rotated refresh token when the revision changes mid-refresh", async () => {
      const store = new MemoryConnectionStore();
      const refresher = createRotatingRefresher();
      const service = createService([oauthProvider], { store, oauthCredentials: refresher });
      await store.set("example", "default", expiredRotating);

      const first = service.getCredential("example");
      await refresher.started();
      const bumped = await bumpRevision(store, { connectionComment: "renamed while refreshing" });
      refresher.release();

      await expect(first).resolves.toMatchObject({ accessToken: "fresh-token-2", refreshToken: "refresh-token-2" });
      const stored = await store.get("example", "default");
      expect(stored?.revision).not.toBe(bumped.revision);
      expect(stored?.credential).toMatchObject({
        accessToken: "fresh-token-2",
        refreshToken: "refresh-token-2",
        expiresAt: "2099-01-01T00:00:00.000Z",
        metadata: {
          oauthAuthorizationId: "authorization-1",
          connectionComment: "renamed while refreshing",
          refreshedAt: "generation-2",
        },
      });

      // The next expiry spends the rotated token, which the provider still accepts.
      await bumpRevision(store, {});
      const current = (await store.get("example", "default"))!;
      if (current.source === "saas" || current.credential.authType !== "oauth2") throw new Error("Expected OAuth");
      await store.updateCredential({
        ...current,
        credential: { ...current.credential, expiresAt: expiredRotating.expiresAt },
      });
      await expect(service.getCredential("example")).resolves.toMatchObject({ refreshToken: "refresh-token-3" });
      expect(refresher.refresh).toHaveBeenCalledTimes(2);
      expect(refresher.refresh.mock.calls[1]?.[1]).toMatchObject({ refreshToken: "refresh-token-2" });
    });

    it("spends the refresh token once for concurrent callers across a revision change", async () => {
      const store = new MemoryConnectionStore();
      const refresher = createRotatingRefresher();
      const service = createService([oauthProvider], { store, oauthCredentials: refresher });
      await store.set("example", "default", expiredRotating);

      const first = service.getCredential("example");
      await refresher.started();
      await bumpRevision(store, { connectionComment: "concurrent write" });
      const second = service.getCredential("example");
      refresher.release();

      await expect(Promise.all([first, second])).resolves.toEqual([
        expect.objectContaining({ refreshToken: "refresh-token-2" }),
        expect.objectContaining({ refreshToken: "refresh-token-2" }),
      ]);
      expect(refresher.refresh).toHaveBeenCalledOnce();
      await expect(store.get("example", "default")).resolves.toMatchObject({
        credential: { refreshToken: "refresh-token-2", metadata: { connectionComment: "concurrent write" } },
      });
    });

    it("clears a concurrent reauth mark once the refresh succeeds", async () => {
      const store = new MemoryConnectionStore();
      const refresher = createRotatingRefresher();
      const service = createService([oauthProvider], { store, oauthCredentials: refresher });
      await store.set("example", "default", expiredRotating);

      const first = service.getCredential("example");
      await refresher.started();
      await bumpRevision(store, { oauthReauthRequired: true });
      refresher.release();

      await expect(first).resolves.toMatchObject({ refreshToken: "refresh-token-2" });
      const stored = await store.get("example", "default");
      expect(stored?.credential).toMatchObject({ refreshToken: "refresh-token-2" });
      expect(stored?.credential?.authType === "oauth2" && stored.credential.metadata).not.toHaveProperty(
        "oauthReauthRequired",
      );
    });

    it("does not overwrite a credential a reconnect stored during the refresh", async () => {
      const store = new MemoryConnectionStore();
      const refresher = createRotatingRefresher();
      const service = createService([oauthProvider], { store, oauthCredentials: refresher });
      const original = await store.set("example", "default", expiredRotating);

      const first = service.getCredential("example");
      await refresher.started();
      expect(
        await store.updateCredential({
          ...original,
          credential: {
            ...expiredRotating,
            accessToken: "reconnected-token",
            refreshToken: "reconnected-refresh-token",
            expiresAt: "2099-01-01T00:00:00.000Z",
            metadata: { oauthAuthorizationId: "authorization-2" },
          },
        }),
      ).toBe(true);
      refresher.release();

      await expect(first).rejects.toMatchObject({ code: "connection_not_found" });
      await expect(store.get("example", "default")).resolves.toMatchObject({
        id: original.id,
        credential: {
          accessToken: "reconnected-token",
          refreshToken: "reconnected-refresh-token",
          metadata: { oauthAuthorizationId: "authorization-2" },
        },
      });
    });

    it("gives up after bounded persist attempts when the revision keeps changing", async () => {
      const memory = new MemoryConnectionStore();
      let updates = 0;
      const store: IConnectionStore = {
        get: memory.get.bind(memory),
        getRetirementGeneration: memory.getRetirementGeneration.bind(memory),
        setIfCurrentGeneration: memory.setIfCurrentGeneration.bind(memory),
        set: memory.set.bind(memory),
        updateCredential: async (input, refresh) => {
          updates++;
          // Every refresh write loses to a concurrent writer that keeps the spent credential.
          if (refresh) await bumpRevision(memory, { racedWrites: updates });
          return memory.updateCredential(input);
        },
        delete: memory.delete.bind(memory),
        list: memory.list.bind(memory),
      };
      const refresher = createRotatingRefresher();
      refresher.release();
      await memory.set("example", "default", expiredRotating);
      const service = createService([oauthProvider], { store, oauthCredentials: refresher });

      await expect(service.getCredential("example")).rejects.toMatchObject({ code: "connection_not_found" });
      expect(refresher.refresh).toHaveBeenCalledOnce();
      expect(updates).toBe(3);
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
    if (resolved.kind !== "local") throw new Error("Expected local connection");
    await expect(resolved.getCredential("uptimerobot")).resolves.toMatchObject({
      apiKey: "original-key",
      profile: { accountId: "example-account" },
    });
  });

  it("preserves mutable execution credentials when admission is configured", async () => {
    const store = new MemoryConnectionStore();
    const credential = {
      authType: "api_key" as const,
      apiKey: "original-key",
      values: { apiKey: "original-key" },
      profile: testProfile,
      metadata: {},
    };
    await store.set("uptimerobot", "default", credential);
    const target = await createService([apiKeyProvider], {
      store,
      providerHttpDispatch: { beforeAttempt: () => ({ allow: true }) },
    }).resolveForExecution("uptimerobot");
    if (target.kind !== "local") throw new Error("Expected local connection");
    expect(await target.getCredential("uptimerobot")).toBe(credential);
    credential.apiKey = "updated-key";
    await expect(target.getCredential("uptimerobot")).resolves.toMatchObject({ apiKey: "updated-key" });
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

describe("ConnectionService disconnect revocation", () => {
  const revocableProvider: ProviderDefinition = {
    ...oauthProvider,
    service: "revocable",
    auth: [
      {
        type: "oauth2",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token",
        revocationUrl: "https://example.com/oauth/revoke",
        scopes: ["read"],
        tokenEndpointAuthMethod: "client_secret_post",
      },
    ],
  };
  const publicRevocableProvider: ProviderDefinition = {
    ...revocableProvider,
    service: "public_revocable",
    auth: [{ ...revocableProvider.auth[0], tokenEndpointAuthMethod: "none" } as ProviderDefinition["auth"][number]],
  };

  async function connectRevocable(
    provider: ProviderDefinition,
    logger = createTestLogger(),
    credential: Partial<Extract<ResolvedCredential, { authType: "oauth2" }>> = {},
  ) {
    const store = new MemoryConnectionStore();
    const oauthClientConfigs = createOAuthClientConfigs([provider]);
    await oauthClientConfigs.upsertConfig({
      service: provider.service,
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    const service = createService([provider], {
      logger,
      oauthCredentials: new OAuthCredentialRefreshService(oauthClientConfigs),
      store,
    });
    await store.set(provider.service, "default", {
      authType: "oauth2",
      accessToken: "access-token",
      tokenType: "Bearer",
      refreshToken: "refresh-token",
      profile: testProfile,
      metadata: {},
      ...credential,
    });
    return { service, store, logger };
  }

  /** Stub fetch with a typed two-argument mock so the recorded init can be read back. */
  function stubRevocationResponse(respond: () => Response | Promise<Response>) {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => respond());
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  }

  function revokeInit(fetcher: ReturnType<typeof stubRevocationResponse>): RequestInit {
    const init = fetcher.mock.calls[0]?.[1];
    if (!init) {
      throw new Error("Expected one revocation request");
    }
    return init;
  }

  function revokeBody(fetcher: ReturnType<typeof stubRevocationResponse>): URLSearchParams {
    const body = revokeInit(fetcher).body;
    if (!(body instanceof URLSearchParams)) {
      throw new Error("Expected the revocation request body to use URLSearchParams");
    }
    return body;
  }

  it("deletes the connection before posting the refresh token once", async () => {
    const { service, store, logger } = await connectRevocable(revocableProvider);
    const fetcher = stubRevocationResponse(async () => {
      await expect(store.get("revocable", "default")).resolves.toBeUndefined();
      return new Response(null, { status: 200 });
    });

    await expect(service.disconnect("revocable", undefined, { revoke: true })).resolves.toEqual({
      service: "revocable",
      connectionName: "default",
      configured: false,
      revoked: "done",
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://example.com/oauth/revoke");
    expect(revokeInit(fetcher)).toMatchObject({
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const body = revokeBody(fetcher);
    expect(body.get("token")).toBe("refresh-token");
    expect(body.get("token_type_hint")).toBe("refresh_token");
    // The token endpoint's client authentication (client_secret_post) applies.
    expect(body.get("client_id")).toBe("client-id");
    expect(body.get("client_secret")).toBe("client-secret");
    await expect(store.get("revocable", "default")).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      { service: "revocable", connectionName: "default", revoked: "done" },
      "oauth token revocation completed",
    );
  });

  it("still deletes the connection when the endpoint refuses the token, and reports failed", async () => {
    const { service, store, logger } = await connectRevocable(revocableProvider);
    const fetcher = stubRevocationResponse(() => Response.json({ error: "invalid_token" }, { status: 400 }));

    await expect(service.disconnect("revocable", undefined, { revoke: true })).resolves.toMatchObject({
      configured: false,
      revoked: "failed",
    });

    expect(fetcher).toHaveBeenCalledOnce();
    await expect(store.get("revocable", "default")).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      {
        service: "revocable",
        connectionName: "default",
        errorCode: "oauth_token_revocation_failed",
        error: "OAuth token revocation failed (HTTP 400, invalid_token).",
      },
      "oauth token revocation failed",
    );
  });

  it("still deletes the connection when the endpoint cannot be reached", async () => {
    const { service, store } = await connectRevocable(revocableProvider);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(service.disconnect("revocable", undefined, { revoke: true })).resolves.toMatchObject({
      configured: false,
      revoked: "failed",
    });
    await expect(store.get("revocable", "default")).resolves.toBeUndefined();
  });

  it("posts the access token when the connection holds no refresh token", async () => {
    const { service } = await connectRevocable(revocableProvider, createTestLogger(), { refreshToken: undefined });
    const fetcher = stubRevocationResponse(() => new Response(null, { status: 200 }));

    await expect(service.disconnect("revocable", undefined, { revoke: true })).resolves.toMatchObject({
      revoked: "done",
    });

    const body = revokeBody(fetcher);
    expect(body.get("token")).toBe("access-token");
    expect(body.get("token_type_hint")).toBe("access_token");
  });

  it("sends no secret for a public client", async () => {
    const { service } = await connectRevocable(publicRevocableProvider);
    const fetcher = stubRevocationResponse(() => new Response(null, { status: 200 }));

    await expect(service.disconnect("public_revocable", undefined, { revoke: true })).resolves.toMatchObject({
      revoked: "done",
    });

    const body = revokeBody(fetcher);
    expect(body.get("client_id")).toBe("client-id");
    expect(body.has("client_secret")).toBe(false);
    expect(revokeInit(fetcher).headers).not.toHaveProperty("authorization");
  });

  it("keeps the grant, and says so, unless the caller asks for a revocation", async () => {
    const { service, store } = await connectRevocable(revocableProvider);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    await expect(service.disconnect("revocable")).resolves.toEqual({
      service: "revocable",
      connectionName: "default",
      configured: false,
      revoked: "skipped",
    });

    expect(fetcher).not.toHaveBeenCalled();
    await expect(store.get("revocable", "default")).resolves.toBeUndefined();
  });

  it("reports unsupported, without any request, for a provider that declares no revocation endpoint", async () => {
    const { service, store } = await connectRevocable(oauthProvider);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    await expect(service.disconnect("example", undefined, { revoke: true })).resolves.toEqual({
      service: "example",
      connectionName: "default",
      configured: false,
      revoked: "unsupported",
    });

    expect(fetcher).not.toHaveBeenCalled();
    await expect(store.get("example", "default")).resolves.toBeUndefined();
  });

  it("reports unsupported for a connection that is not OAuth, and for one that is not held", async () => {
    const service = createService([apiKeyProvider, revocableProvider]);
    await service.connectWithApiKey("uptimerobot", { values: { apiKey: "key", accountId: "acct" } });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    await expect(service.disconnect("uptimerobot", undefined, { revoke: true })).resolves.toMatchObject({
      configured: false,
      revoked: "unsupported",
    });
    await expect(service.disconnect("revocable", undefined, { revoke: true })).resolves.toMatchObject({
      configured: false,
      revoked: "unsupported",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("revokes nothing when the store refuses the delete", async () => {
    const { service, store } = await connectRevocable(revocableProvider);
    const fetcher = stubRevocationResponse(() => new Response(null, { status: 200 }));
    const refused = new Error("Cancel or abandon remote Trigger subscriptions before disconnecting this connection.");
    vi.spyOn(store, "delete").mockRejectedValueOnce(refused);

    await expect(service.disconnect("revocable", undefined, { revoke: true })).rejects.toBe(refused);

    expect(fetcher).not.toHaveBeenCalled();
    await expect(store.get("revocable", "default")).resolves.toMatchObject({ credential: { authType: "oauth2" } });
  });
});

interface CreateServiceOptions {
  providerHttpDispatch?: ProviderHttpDispatchOptions;
  logger?: ReturnType<typeof createTestLogger>;
  oauthCredentials?: IOAuthCredentialRefresher;
  providerLoader?: IProviderLoader;
  store?: IConnectionStore;
}

function createService(providers: ProviderDefinition[], options: CreateServiceOptions = {}): ConnectionService {
  const catalog = createCatalogStore(providers);

  return new ConnectionService({
    providerHttpDispatch: options.providerHttpDispatch,
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

  private readonly retirementGenerations = new Map<string, string>();

  async getRetirementGeneration(service: string, connectionName: string): Promise<string> {
    const key = JSON.stringify([service, connectionName]);
    let generation = this.retirementGenerations.get(key);
    if (!generation) {
      generation = crypto.randomUUID();
      this.retirementGenerations.set(key, generation);
    }
    return generation;
  }

  async setIfCurrentGeneration(
    service: string,
    connectionName: string,
    credential: ResolvedCredential,
    retirementGeneration: string,
  ) {
    if ((await this.getRetirementGeneration(service, connectionName)) !== retirementGeneration) return undefined;
    return this.set(service, connectionName, credential);
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential) {
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
    this.retirementGenerations.set(JSON.stringify([service, connectionName]), crypto.randomUUID());
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

it("keeps SaaS references out of the local credential and refresh paths", async () => {
  const store = new MemoryConnectionStore();
  const remote: StoredConnection = {
    source: "saas",
    id: "remote",
    revision: "revision",
    service: "example",
    connectionName: "default",
    reference: {
      managedProjectId: "project",
      providerConfigId: "config",
      externalUserId: "user",
      connectedAccountId: "account",
      localRequestId: "request",
    },
    profile: testProfile,
    status: "active",
    comment: null,
  };
  vi.spyOn(store, "get").mockResolvedValue(remote);
  vi.spyOn(store, "list").mockResolvedValue([remote]);
  const service = createService([oauthProvider], { store });
  expect(await service.resolveForExecution("example")).toMatchObject({ kind: "saas", reference: remote.reference });
  expect(await service.getConnectionSummary("example")).toMatchObject({ profile: testProfile, configured: true });
  expect(await service.listAuthenticatedServices(["example"])).toContain("example");
  await expect(service.getCredential("example")).rejects.toMatchObject({ code: "unsupported_auth_type" });
});
