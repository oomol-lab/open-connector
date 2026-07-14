import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { ResolvedCredential } from "../../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import { OAuthClientCredentialsService } from "../../oauth/oauth-client-credentials-service.ts";
import { OAuthCredentialRefreshService } from "../../oauth/oauth-credential-refresh-service.ts";
import { ProviderLoader } from "../provider-loader.ts";
import { provider } from "./definition.ts";

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Tailscale provider integration", () => {
  it("connects, verifies, renews, stores, and executes both device actions", async () => {
    setDefaultGuardedFetchDnsLookup(null);
    let tokenRequests = 0;
    const apiAuthorizations: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.tailscale.com/api/v2/oauth/token") {
        tokenRequests += 1;
        return Response.json({
          access_token: `tailscale-token-${tokenRequests}`,
          token_type: "Bearer",
          expires_in: tokenRequests === 1 ? 1 : 3600,
          scope: "devices:core:read",
        });
      }

      apiAuthorizations.push(new Headers(init?.headers).get("authorization") ?? "");
      if (url === "https://api.tailscale.com/api/v2/tailnet/-/devices") {
        return Response.json({
          devices: [{ nodeId: "n123", hostname: "example-device", connectedToControl: true }],
        });
      }
      if (url === "https://api.tailscale.com/api/v2/device/n123") {
        return Response.json({ nodeId: "n123", hostname: "example-device", connectedToControl: true });
      }
      return Response.json({ message: "not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    const catalog = createCatalogStore([provider], {
      executableActionIds: provider.actions.map((action) => action.id),
    });
    const providerLoader = new ProviderLoader({
      tailscale: () => import("./executors.ts"),
    });
    const connectionStore = new MemoryConnectionStore();
    const clientConfigs = new OAuthClientConfigService({
      catalog,
      origin: "http://localhost:3000",
      store: new MemoryOAuthClientConfigStore(),
    });
    const connections = new ConnectionService({
      catalog,
      oauthCredentials: new OAuthCredentialRefreshService(clientConfigs),
      providerLoader,
      store: connectionStore,
    });
    const clientCredentials = new OAuthClientCredentialsService({ clientConfigs, connections });

    await expect(
      clientCredentials.connect({
        service: "tailscale",
        connectionName: "production",
        values: { clientId: "client-id", clientSecret: "client-secret" },
      }),
    ).resolves.toMatchObject({
      service: "tailscale",
      connectionName: "production",
      configured: true,
      profile: { grantedScopes: ["devices:core:read"] },
    });
    await expect(connectionStore.get("tailscale", "production")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "tailscale-token-1",
      clientCredentials: { clientId: "client-id", clientSecret: "client-secret" },
      metadata: { verifiedDeviceCount: 1 },
    });

    const listAction = catalog.actionsById.get("tailscale.list_devices")!;
    const listExecutor = await providerLoader.loadActionExecutor("tailscale", listAction.id, provider.displayName);
    await expect(
      executeAction(listAction, listExecutor, {}, connections.forConnection("production")),
    ).resolves.toMatchObject({
      ok: true,
      output: { devices: [{ nodeId: "n123", hostname: "example-device" }] },
    });

    const getAction = catalog.actionsById.get("tailscale.get_device")!;
    const getExecutor = await providerLoader.loadActionExecutor("tailscale", getAction.id, provider.displayName);
    await expect(
      executeAction(getAction, getExecutor, { deviceId: "n123" }, connections.forConnection("production")),
    ).resolves.toMatchObject({
      ok: true,
      output: { nodeId: "n123", hostname: "example-device" },
    });

    expect(tokenRequests).toBe(2);
    expect(apiAuthorizations).toEqual([
      "Bearer tailscale-token-1",
      "Bearer tailscale-token-2",
      "Bearer tailscale-token-2",
    ]);
    await expect(connectionStore.get("tailscale", "production")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "tailscale-token-1",
      clientCredentials: { clientId: "client-id", clientSecret: "client-secret" },
    });
    await expect(connections.getCredential("tailscale", "production")).resolves.toMatchObject({
      authType: "oauth2",
      accessToken: "tailscale-token-2",
    });

    const tokenBodies = fetcher.mock.calls
      .filter(([input]) => String(input) === "https://api.tailscale.com/api/v2/oauth/token")
      .map(([, init]) => Object.fromEntries(new URLSearchParams(String(init?.body))));
    expect(tokenBodies).toEqual([
      {
        grant_type: "client_credentials",
        scope: "devices:core:read",
        client_id: "client-id",
        client_secret: "client-secret",
      },
      {
        grant_type: "client_credentials",
        scope: "devices:core:read",
        client_id: "client-id",
        client_secret: "client-secret",
      },
    ]);
  });
});

class MemoryConnectionStore implements IConnectionStore {
  private readonly connections = new Map<string, ResolvedCredential>();

  async get(service: string, connectionName: string): Promise<ResolvedCredential | undefined> {
    return this.connections.get(`${service}:${connectionName}`);
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<void> {
    this.connections.set(`${service}:${connectionName}`, credential);
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.connections.delete(`${service}:${connectionName}`);
  }

  async list(): Promise<StoredConnection[]> {
    return [...this.connections.entries()].map(([key, credential]) => {
      const separator = key.indexOf(":");
      return {
        service: key.slice(0, separator),
        connectionName: key.slice(separator + 1),
        credential,
      };
    });
  }
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
