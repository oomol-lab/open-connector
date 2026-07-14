import type { IConnectionStore, StoredConnection } from "../connection-service.ts";
import type {
  ActionExecutor,
  CredentialValidators,
  ProviderDefinition,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../core/types.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "./oauth-client-config-service.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { OAuthClientConfigService } from "./oauth-client-config-service.ts";
import { OAuthClientCredentialsService } from "./oauth-client-credentials-service.ts";
import { OAuthCredentialRefreshService } from "./oauth-credential-refresh-service.ts";

const provider: ProviderDefinition = {
  service: "machine_api",
  displayName: "Machine API",
  categories: ["Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      flow: "client_credentials",
      tokenUrl: "https://example.com/{tenant}/oauth/token",
      scopes: ["read", "write"],
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFields: {
        clientCredentials: { configFields: { tags: "tags" } },
      },
      clientConfigFields: [
        {
          key: "tenant",
          label: "Tenant",
          inputType: "text",
          required: true,
          secret: false,
        },
        {
          key: "tags",
          label: "Tags",
          inputType: "text",
          required: false,
          secret: false,
        },
      ],
    },
  ],
  actions: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OAuthClientCredentialsService", () => {
  it("stores client credentials on the named encrypted-connection payload and renews without a refresh token", async () => {
    const store = new MemoryConnectionStore();
    const catalog = createCatalogStore([provider]);
    const clientConfigs = new OAuthClientConfigService({
      catalog,
      origin: "http://localhost:3000",
      store: new EmptyOAuthClientConfigStore(),
    });
    const connections = new ConnectionService({
      catalog,
      oauthCredentials: new OAuthCredentialRefreshService(clientConfigs),
      providerLoader: new EmptyProviderLoader(),
      store,
    });
    const service = new OAuthClientCredentialsService({ clientConfigs, connections });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "first-token", expires_in: -1, scope: "read write" }))
      .mockResolvedValueOnce(Response.json({ access_token: "renewed-token", expires_in: 3600, scope: "read write" }));
    vi.stubGlobal("fetch", fetcher);

    const summary = await service.connect({
      service: "machine_api",
      connectionName: "production",
      values: {
        clientId: "client-id",
        clientSecret: "client-secret",
        tenant: "acme",
        tags: "tag:server",
      },
    });

    expect(summary).toMatchObject({
      service: "machine_api",
      connectionName: "production",
      authType: "oauth2",
      configured: true,
    });
    expect(summary).not.toHaveProperty("clientSecret");
    expect(await store.get("machine_api", "production")).toMatchObject({
      accessToken: "first-token",
      clientCredentials: {
        clientId: "client-id",
        clientSecret: "client-secret",
        extra: { tenant: "acme", tags: "tag:server" },
      },
    });

    const renewed = await connections.getCredential("machine_api", "production");
    expect(renewed).toMatchObject({ accessToken: "renewed-token" });
    await expect(connections.getCredential("machine_api", "production")).resolves.toMatchObject({
      accessToken: "renewed-token",
    });
    await expect(store.get("machine_api", "production")).resolves.toMatchObject({
      accessToken: "first-token",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://example.com/acme/oauth/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(new URLSearchParams(String(fetcher.mock.calls[1]?.[1]?.body)).get("tags")).toBe("tag:server");
  });

  it("rejects missing client credential fields before making a token request", async () => {
    const store = new MemoryConnectionStore();
    const catalog = createCatalogStore([provider]);
    const clientConfigs = new OAuthClientConfigService({
      catalog,
      origin: "http://localhost:3000",
      store: new EmptyOAuthClientConfigStore(),
    });
    const connections = new ConnectionService({
      catalog,
      providerLoader: new EmptyProviderLoader(),
      store,
    });
    const service = new OAuthClientCredentialsService({ clientConfigs, connections });

    await expect(service.connect({ service: "machine_api", values: { clientId: "client-id" } })).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});

class MemoryConnectionStore implements IConnectionStore {
  private readonly credentials = new Map<string, ResolvedCredential>();

  async get(service: string, connectionName: string): Promise<ResolvedCredential | undefined> {
    return this.credentials.get(`${service}:${connectionName}`);
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<void> {
    this.credentials.set(`${service}:${connectionName}`, credential);
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.credentials.delete(`${service}:${connectionName}`);
  }

  async list(): Promise<StoredConnection[]> {
    return [...this.credentials.entries()].map(([id, credential]) => {
      const separator = id.indexOf(":");
      return {
        service: id.slice(0, separator),
        connectionName: id.slice(separator + 1),
        credential,
      };
    });
  }
}

class EmptyOAuthClientConfigStore implements IOAuthClientConfigStore {
  async get(): Promise<OAuthClientConfig | undefined> {
    return undefined;
  }
  async set(): Promise<void> {}
  async delete(): Promise<void> {}
  async list(): Promise<OAuthClientConfig[]> {
    return [];
  }
}

class EmptyProviderLoader implements IProviderLoader {
  async loadActionExecutor(): Promise<ActionExecutor | undefined> {
    return undefined;
  }
  async loadProxyExecutor(): Promise<ProviderProxyExecutor | undefined> {
    return undefined;
  }
  async loadCredentialValidators(): Promise<CredentialValidators | undefined> {
    return undefined;
  }
}
