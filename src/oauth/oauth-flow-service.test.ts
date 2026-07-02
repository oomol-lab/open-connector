import type { IConnectionStore, StoredConnection } from "../connection-service.ts";
import type { ActionExecutor, CredentialValidators, ProviderDefinition, ResolvedCredential } from "../core/types.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "./oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "./oauth-flow-service.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { OAuthClientConfigService } from "./oauth-client-config-service.ts";
import { OAuthFlowService } from "./oauth-flow-service.ts";

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
      scopes: ["read", "write"],
      redirectPath: "/oauth/callback/example",
      tokenEndpointAuthMethod: "client_secret_post",
      clientConfigFields: [
        {
          key: "tenant",
          label: "Tenant",
          inputType: "text",
          required: true,
          secret: false,
        },
      ],
    },
  ],
  actions: [],
};

const pkceOAuthProvider: ProviderDefinition = {
  ...oauthProvider,
  service: "pkce",
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://pkce.example.com/oauth/authorize",
      tokenUrl: "https://pkce.example.com/oauth/token",
      scopes: ["read"],
      redirectPath: "/oauth/callback/pkce",
      tokenEndpointAuthMethod: "client_secret_basic",
      pkce: {
        method: "S256",
      },
      clientConfigFields: [
        {
          key: "appBearerToken",
          label: "App Bearer Token",
          inputType: "password",
          required: false,
          secret: true,
          location: "secretExtra",
        },
      ],
    },
  ],
};

const customOAuthProvider: ProviderDefinition = {
  ...oauthProvider,
  service: "custom_oauth",
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://example.com/{tenant}/authorize",
      tokenUrl: "https://example.com/{tenant}/token",
      refreshTokenUrl: "https://example.com/{tenant}/refresh",
      scopes: ["read", "write"],
      scopeSeparator: ",",
      redirectPath: "/oauth/callback/custom_oauth",
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "json",
      authorizationRequestFields: {
        clientId: "app_id",
        responseType: false,
      },
      tokenRequestFields: {
        code: "auth_code",
        clientId: "app_id",
        clientSecret: "secret",
        authorizationCode: {
          grantType: false,
          redirectUri: false,
        },
      },
      tokenResponseEnvelope: {
        dataField: "data",
        codeField: "code",
        successCode: 0,
        messageField: "message",
      },
      clientConfigFields: [
        {
          key: "tenant",
          label: "Tenant",
          inputType: "text",
          required: true,
          secret: false,
          defaultValue: "common",
        },
      ],
    },
  ],
};

const overrideAuthorizationParamsProvider: ProviderDefinition = {
  ...oauthProvider,
  service: "override_oauth",
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://example.com/oauth/authorize",
      tokenUrl: "https://example.com/oauth/token",
      scopes: ["read"],
      redirectPath: "/oauth/callback/override_oauth",
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        client_id: "static-client-id",
        code_challenge: "static-code-challenge",
        redirect_uri: "https://evil.example.com/callback",
        state: "static-state",
      },
      pkce: {
        method: "S256",
      },
    },
  ],
};

describe("OAuthFlowService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds an authorization URL from user-provided client config", async () => {
    const services = createServices([oauthProvider]);
    await services.clientConfigs.upsertConfig({
      service: "example",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: {
        tenant: " default ",
      },
    });

    await expect(services.clientConfigs.getConfig("example")).resolves.toMatchObject({
      extra: {
        tenant: "default",
      },
    });

    const started = await services.flow.startAuthorization({ service: "example", connectionName: "work" });
    const authorizationUrl = new URL(started.authorizationUrl);

    expect(authorizationUrl.origin).toBe("https://example.com");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("http://localhost:3000/oauth/callback/example");
    expect(authorizationUrl.searchParams.get("scope")).toBe("read write");
    expect(authorizationUrl.searchParams.get("state")).toBe(started.state);
    expect(await services.states.take(started.state)).toMatchObject({
      service: "example",
      connectionName: "work",
    });
  });

  it("requires OAuth client config before authorization", async () => {
    const services = createServices([oauthProvider]);

    await expect(services.flow.startAuthorization({ service: "example" })).rejects.toMatchObject({
      code: "oauth_client_config_required",
    });
  });

  it("requires declared OAuth client config fields", async () => {
    const services = createServices([oauthProvider]);

    await expect(
      services.clientConfigs.upsertConfig({
        service: "example",
        clientId: "client-id",
        clientSecret: "client-secret",
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "tenant is required.",
    });
  });

  it("does not let static authorization params override generated OAuth invariants", async () => {
    const services = createServices([overrideAuthorizationParamsProvider]);
    await services.clientConfigs.upsertConfig({
      service: "override_oauth",
      clientId: "client-id",
      clientSecret: "client-secret",
    });

    const started = await services.flow.startAuthorization({ service: "override_oauth" });
    const authorizationUrl = new URL(started.authorizationUrl);

    expect(authorizationUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/oauth/callback/override_oauth",
    );
    expect(authorizationUrl.searchParams.get("state")).toBe(started.state);
    expect(authorizationUrl.searchParams.get("code_challenge")).not.toBe("static-code-challenge");
  });

  it("stores completed OAuth credentials under the requested connection name", async () => {
    const services = createServices([oauthProvider]);
    await services.clientConfigs.upsertConfig({
      service: "example",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: {
        tenant: "default",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "access-token", token_type: "Bearer" })),
    );

    const started = await services.flow.startAuthorization({ service: "example", connectionName: "work" });
    await expect(services.flow.completeAuthorization({ state: started.state, code: "code" })).resolves.toEqual({
      service: "example",
      connected: true,
    });

    await expect(services.connections.getCredential("example", "work")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "access-token",
    });
    await expect(services.connections.getCredential("example")).resolves.toBeUndefined();
  });

  it("stores secret OAuth client config fields in completed credential metadata", async () => {
    const services = createServices([pkceOAuthProvider]);
    await services.clientConfigs.upsertConfig({
      service: "pkce",
      clientId: "client-id",
      clientSecret: "client-secret",
      secretExtra: {
        appBearerToken: " app-token ",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "access-token", token_type: "Bearer" })),
    );

    const started = await services.flow.startAuthorization({ service: "pkce" });
    await services.flow.completeAuthorization({ state: started.state, code: "code" });

    await expect(services.connections.getCredential("pkce")).resolves.toMatchObject({
      authType: "oauth2",
      metadata: {
        oauthClientSecretExtra: {
          appBearerToken: "app-token",
        },
      },
    });
  });

  it("adds PKCE challenge and verifier for providers that require it", async () => {
    const services = createServices([pkceOAuthProvider]);
    await services.clientConfigs.upsertConfig({
      service: "pkce",
      clientId: "client:id",
      clientSecret: "client:secret",
    });
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ access_token: "access-token", token_type: "Bearer" }),
    );
    vi.stubGlobal("fetch", fetcher);

    const started = await services.flow.startAuthorization({ service: "pkce" });
    const authorizationUrl = new URL(started.authorizationUrl);

    expect(authorizationUrl.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    await services.flow.completeAuthorization({ state: started.state, code: "code" });

    const tokenRequest = fetcher.mock.calls[0]?.[1] as RequestInit | undefined;
    const tokenBody = tokenRequest?.body;
    expect(tokenRequest?.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("client%3Aid:client%3Asecret").toString("base64")}`,
    });
    expect(tokenBody).toBeInstanceOf(URLSearchParams);
    expect((tokenBody as URLSearchParams).get("code_verifier")).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("accepts token responses that use token instead of access_token", async () => {
    const services = createServices([oauthProvider]);
    await services.clientConfigs.upsertConfig({
      service: "example",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: {
        tenant: "default",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ token: "intercom-token" })),
    );

    const started = await services.flow.startAuthorization({ service: "example", connectionName: "work" });
    await expect(services.flow.completeAuthorization({ state: started.state, code: "code" })).resolves.toEqual({
      service: "example",
      connected: true,
    });

    await expect(services.connections.getCredential("example", "work")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "intercom-token",
    });
  });

  it("supports provider-specific authorization and token request shapes", async () => {
    const services = createServices([customOAuthProvider]);
    await services.clientConfigs.upsertConfig({
      service: "custom_oauth",
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        code: 0,
        data: {
          access_token: "custom-access-token",
          accessToken: "camel-access-token",
          refresh_token: "custom-refresh-token",
          refreshToken: "camel-refresh-token",
          idToken: "id-token",
          token_type: "Bearer",
          posthog_base_url: "https://eu.posthog.com",
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const started = await services.flow.startAuthorization({ service: "custom_oauth" });
    const authorizationUrl = new URL(started.authorizationUrl);

    expect(authorizationUrl.toString()).toContain("https://example.com/common/authorize");
    expect(authorizationUrl.searchParams.get("app_id")).toBe("client-id");
    expect(authorizationUrl.searchParams.has("client_id")).toBe(false);
    expect(authorizationUrl.searchParams.has("response_type")).toBe(false);
    expect(authorizationUrl.searchParams.get("scope")).toBe("read,write");

    await services.flow.completeAuthorization({ state: started.state, code: "code" });
    const tokenRequest = fetcher.mock.calls[0];
    expect(tokenRequest?.[0]).toBe("https://example.com/common/token");
    expect(JSON.parse(String(tokenRequest?.[1]?.body))).toEqual({
      app_id: "client-id",
      auth_code: "code",
      secret: "client-secret",
    });
    await expect(services.connections.getCredential("custom_oauth")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "custom-access-token",
      refreshToken: "custom-refresh-token",
      metadata: {
        oauthClientExtra: {
          tenant: "common",
        },
        posthog_base_url: "https://eu.posthog.com",
      },
    });
    const credential = await services.connections.getCredential("custom_oauth");
    expect(credential?.authType).toBe("oauth2");
    if (credential?.authType === "oauth2") {
      expect(credential.metadata).not.toHaveProperty("access_token");
      expect(credential.metadata).not.toHaveProperty("accessToken");
      expect(credential.metadata).not.toHaveProperty("refresh_token");
      expect(credential.metadata).not.toHaveProperty("refreshToken");
      expect(credential.metadata).not.toHaveProperty("idToken");
    }
  });
});

function createServices(providers: ProviderDefinition[]): {
  clientConfigs: OAuthClientConfigService;
  connections: ConnectionService;
  flow: OAuthFlowService;
  states: MemoryOAuthStateStore;
} {
  const catalog = createCatalogStore(providers);
  const connections = new ConnectionService({
    catalog,
    providerLoader: new EmptyProviderLoader(),
    store: new MemoryConnectionStore(),
  });
  const clientConfigs = new OAuthClientConfigService({
    catalog,
    origin: "http://localhost:3000",
    store: new MemoryOAuthClientConfigStore(),
  });

  const states = new MemoryOAuthStateStore();
  return {
    clientConfigs,
    connections,
    flow: new OAuthFlowService({
      clientConfigs,
      connections,
      states,
    }),
    states,
  };
}

class EmptyProviderLoader implements IProviderLoader {
  async loadActionExecutor(_service: string, _actionId: string): Promise<ActionExecutor | undefined> {
    return undefined;
  }

  async loadCredentialValidators(_service: string): Promise<CredentialValidators | undefined> {
    return undefined;
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

class MemoryOAuthStateStore implements IOAuthStateStore {
  private readonly states = new Map<string, OAuthAuthorizationState>();

  async set(state: OAuthAuthorizationState): Promise<void> {
    this.states.set(state.state, state);
  }

  async take(state: string): Promise<OAuthAuthorizationState | undefined> {
    const value = this.states.get(state);
    this.states.delete(state);
    return value;
  }
}
