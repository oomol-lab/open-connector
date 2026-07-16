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
        return Response.json({
          matches: [{ users: ["group:engineering"], ports: ["tag:server:22"], lineNumber: 19 }],
          type: "user",
          previewFor: "alice@example.com",
        });
      }
      if (url.startsWith("https://api.tailscale.com/api/v2/tailnet/-/users?")) {
        return Response.json({ users: [{ id: "u1", loginName: "alice@example.com", type: "member" }] });
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
    ).resolves.toMatchObject({
      ok: true,
      output: { matches: [{ users: ["group:engineering"], ports: ["tag:server:22"], lineNumber: 19 }] },
    });
    // Output is never validated at runtime, so agents rely on this schema alone to read the result.
    expect(previewAction.outputSchema).toMatchObject({
      type: "object",
      required: ["matches"],
      properties: { matches: { type: "array" } },
    });

    const usersAction = catalog.actionsById.get("tailscale.list_users")!;
    const usersExecutor = await providerLoader.loadActionExecutor("tailscale", usersAction.id, provider.displayName);
    await expect(
      executeAction(usersAction, usersExecutor, {}, connections.forConnection("production")),
    ).resolves.toMatchObject({ ok: true, output: { users: [{ id: "u1" }] } });

    await expect(
      executeAction(usersAction, usersExecutor, { type: "member" }, connections.forConnection("production")),
    ).resolves.toMatchObject({ ok: true });
    expect(apiUrls.at(-1)).toBe("https://api.tailscale.com/api/v2/tailnet/-/users?type=member");

    expect(tokenRequests).toBe(7);
    expect(apiAuthorizations).toEqual([
      "Bearer tailscale-token-1",
      "Bearer tailscale-token-2",
      "Bearer tailscale-token-3",
      "Bearer tailscale-token-4",
      "Bearer tailscale-token-5",
      "Bearer tailscale-token-6",
      "Bearer tailscale-token-7",
    ]);
    const tokenBodies = fetcher.mock.calls
      .filter(([input]) => String(input) === "https://api.tailscale.com/api/v2/oauth/token")
      .map(([, init]) => Object.fromEntries(new URLSearchParams(String(init?.body))));
    const credential = { grant_type: "client_credentials", client_id: "client-id", client_secret: "client-secret" };
    // Credential validation omits `scope` entirely so that any OAuth client can connect; each action
    // then requests exactly the scopes its own operation declares.
    expect(tokenBodies).toEqual([
      credential,
      { ...credential, scope: "devices:core:read" },
      { ...credential, scope: "devices:core:read" },
      { ...credential, scope: "logs:configuration:read" },
      { ...credential, scope: "policy_file:read" },
      { ...credential, scope: "users:read" },
      { ...credential, scope: "users:read" },
    ]);
    expect(apiUrls).toEqual([
      "https://api.tailscale.com/api/v2/tailnet/-/devices",
      "https://api.tailscale.com/api/v2/tailnet/-/devices",
      "https://api.tailscale.com/api/v2/device/n123",
      "https://api.tailscale.com/api/v2/tailnet/-/logging/configuration?start=2026-07-01T00%3A00%3A00Z&end=2026-07-02T00%3A00%3A00Z&actor=user-1&actor=%7Ealice&event=USER.CREATE",
      "https://api.tailscale.com/api/v2/tailnet/-/acl/preview?type=user&previewFor=alice%40example.com",
      // Tailscale defaults `type` to `member`, so the operation sends `all` to keep an unfiltered
      // call genuinely unfiltered instead of silently dropping shared users.
      "https://api.tailscale.com/api/v2/tailnet/-/users?type=all",
      // An explicit filter still wins over that default.
      "https://api.tailscale.com/api/v2/tailnet/-/users?type=member",
    ]);
    expect(apiMethods).toEqual(["GET", "GET", "GET", "GET", "POST", "GET", "GET"]);
    const previewCall = fetcher.mock.calls.find(([input]) =>
      String(input).startsWith("https://api.tailscale.com/api/v2/tailnet/-/acl/preview?"),
    );
    expect(previewCall?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          acls: [{ action: "accept", src: ["group:engineering"], dst: ["tag:server:22"] }],
        }),
      }),
    );
    expect(provider.actions).toHaveLength(32);
  });

  it("connects an OAuth client that was never granted device read access", async () => {
    setDefaultGuardedFetchDnsLookup(null);
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.tailscale.com/api/v2/oauth/token") {
        // This client holds only dns:read, so Tailscale refuses to mint a token for any other
        // scope. Omitting `scope` asks for nothing in particular and yields what the client holds.
        const requestedScope = new URLSearchParams(String(init?.body)).get("scope");
        if (requestedScope !== null && requestedScope !== "dns:read") {
          return Response.json(
            { error: "invalid_scope", error_description: `client is not permitted scope ${requestedScope}` },
            { status: 400 },
          );
        }
        return Response.json({ access_token: "dns-token", token_type: "Bearer", expires_in: 3600, scope: "dns:read" });
      }
      return Response.json({ message: "not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    const catalog = createCatalogStore([provider], {
      executableActionIds: provider.actions.map((action) => action.id),
    });
    const connectionStore = new MemoryConnectionStore();
    const connections = new ConnectionService({
      catalog,
      providerLoader: new ProviderLoader({ tailscale: () => import("./executors.ts") }),
      store: connectionStore,
    });

    // The scope-free token exchange proves the credential, so the connection succeeds and reports
    // the scopes Tailscale actually granted rather than the device scope this client lacks.
    await expect(
      connections.connectWithCustomCredential("tailscale", {
        connectionName: "dns-only",
        values: { clientId: "client-id", clientSecret: "client-secret" },
      }),
    ).resolves.toMatchObject({
      configured: true,
      profile: { grantedScopes: ["dns:read"] },
    });
    const stored = await connectionStore.get("tailscale", "dns-only");
    if (stored?.authType !== "custom_credential") {
      throw new Error("expected a stored custom credential");
    }
    expect(stored.metadata).toEqual({ tailnet: "-" });
    // The device probe is skipped rather than attempted-and-forgiven, so only the token exchange ran.
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["https://api.tailscale.com/api/v2/oauth/token"]);
  });

  it("rejects a credential whose tailnet does not exist", async () => {
    setDefaultGuardedFetchDnsLookup(null);
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.tailscale.com/api/v2/oauth/token") {
        return Response.json({
          access_token: "device-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "devices:core:read",
        });
      }
      return Response.json({ message: "tailnet not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    const connections = new ConnectionService({
      catalog: createCatalogStore([provider], { executableActionIds: provider.actions.map((action) => action.id) }),
      providerLoader: new ProviderLoader({ tailscale: () => import("./executors.ts") }),
      store: new MemoryConnectionStore(),
    });

    // The token is valid and can read devices, so a failing probe is a real error — a mistyped
    // tailnet must surface here instead of leaving every action to fail with an opaque 404.
    await expect(
      connections.connectWithCustomCredential("tailscale", {
        connectionName: "typo",
        values: { clientId: "client-id", clientSecret: "client-secret", tailnet: "typo.example.net" },
      }),
    ).rejects.toThrow(/tailnet not found/);
    // The catch-all 404 would answer the default tailnet too, so pin the probed URL to prove the
    // configured tailnet is what actually reached the API.
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.tailscale.com/api/v2/oauth/token",
      "https://api.tailscale.com/api/v2/tailnet/typo.example.net/devices",
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
