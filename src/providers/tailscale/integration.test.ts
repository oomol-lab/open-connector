import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { ProviderLoader } from "../provider-loader.ts";
import { provider } from "./definition.ts";

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Tailscale provider integration", () => {
  it("verifies custom credentials and executes representative safe operations", async () => {
    setDefaultGuardedFetchDnsLookup(null);
    let tokenRequests = 0;
    const apiAuthorizations: string[] = [];
    const apiUrls: string[] = [];
    const apiMethods: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.tailscale.com/api/v2/oauth/token") {
        tokenRequests += 1;
        return Response.json({
          access_token: `tailscale-token-${tokenRequests}`,
          token_type: "Bearer",
          expires_in: 3600,
          scope: "devices:core:read",
        });
      }

      apiAuthorizations.push(new Headers(init?.headers).get("authorization") ?? "");
      apiUrls.push(url);
      apiMethods.push(init?.method ?? "GET");
      if (url === "https://api.tailscale.com/api/v2/tailnet/-/devices") {
        return Response.json({
          devices: [{ nodeId: "n123", hostname: "example-device", connectedToControl: true }],
        });
      }
      if (url === "https://api.tailscale.com/api/v2/device/n123") {
        return Response.json({ nodeId: "n123", hostname: "example-device", connectedToControl: true });
      }
      if (url.startsWith("https://api.tailscale.com/api/v2/tailnet/-/logging/configuration?")) {
        return Response.json({ version: "1.0", tailnet: "example.ts.net", logs: [] });
      }
      if (url.startsWith("https://api.tailscale.com/api/v2/tailnet/-/acl/preview?") && init?.method === "POST") {
        return Response.json([{ action: "accept", src: ["group:engineering"], dst: ["tag:server:22"] }]);
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
    const connections = new ConnectionService({
      catalog,
      providerLoader,
      store: connectionStore,
    });

    await expect(
      connections.connectWithCustomCredential("tailscale", {
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
      authType: "custom_credential",
      values: { clientId: "client-id", clientSecret: "client-secret" },
      metadata: { tailnet: "-", verifiedDeviceCount: 1 },
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

    const auditAction = catalog.actionsById.get("tailscale.list_configuration_audit_logs")!;
    const auditExecutor = await providerLoader.loadActionExecutor("tailscale", auditAction.id, provider.displayName);
    await expect(
      executeAction(
        auditAction,
        auditExecutor,
        {
          start: "2026-07-01T00:00:00Z",
          end: "2026-07-02T00:00:00Z",
          actors: ["user-1", "~alice"],
          events: ["USER.CREATE"],
        },
        connections.forConnection("production"),
      ),
    ).resolves.toMatchObject({ ok: true, output: { logs: [] } });

    const previewAction = catalog.actionsById.get("tailscale.preview_policy_rule_matches")!;
    const previewExecutor = await providerLoader.loadActionExecutor(
      "tailscale",
      previewAction.id,
      provider.displayName,
    );
    await expect(
      executeAction(
        previewAction,
        previewExecutor,
        {
          type: "user",
          previewFor: "alice@example.com",
          policy: { acls: [{ action: "accept", src: ["group:engineering"], dst: ["tag:server:22"] }] },
        },
        connections.forConnection("production"),
      ),
    ).resolves.toMatchObject({ ok: true, output: [{ action: "accept" }] });

    expect(tokenRequests).toBe(5);
    expect(apiAuthorizations).toEqual([
      "Bearer tailscale-token-1",
      "Bearer tailscale-token-2",
      "Bearer tailscale-token-3",
      "Bearer tailscale-token-4",
      "Bearer tailscale-token-5",
    ]);
    const tokenBodies = fetcher.mock.calls
      .filter(([input]) => String(input) === "https://api.tailscale.com/api/v2/oauth/token")
      .map(([, init]) => Object.fromEntries(new URLSearchParams(String(init?.body))));
    expect(tokenBodies.map((body) => body.scope)).toEqual([
      "devices:core:read",
      "devices:core:read",
      "devices:core:read",
      "logs:configuration:read",
      "policy_file:read",
    ]);
    expect(tokenBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          grant_type: "client_credentials",
          client_id: "client-id",
          client_secret: "client-secret",
        }),
      ]),
    );
    expect(apiUrls.at(-2)).toBe(
      "https://api.tailscale.com/api/v2/tailnet/-/logging/configuration?start=2026-07-01T00%3A00%3A00Z&end=2026-07-02T00%3A00%3A00Z&actor=user-1&actor=%7Ealice&event=USER.CREATE",
    );
    expect(apiUrls.at(-1)).toBe(
      "https://api.tailscale.com/api/v2/tailnet/-/acl/preview?type=user&previewFor=alice%40example.com",
    );
    expect(apiMethods.at(-1)).toBe("POST");
    expect(fetcher.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          acls: [{ action: "accept", src: ["group:engineering"], dst: ["tag:server:22"] }],
        }),
      }),
    );
    expect(provider.actions).toHaveLength(32);
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
