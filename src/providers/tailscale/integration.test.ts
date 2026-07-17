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
  it("verifies custom credentials and executes representative read and write operations", async () => {
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
      if (url === "https://api.tailscale.com/api/v2/device/n123/routes" && init?.method === "POST") {
        return Response.json({ advertisedRoutes: ["10.0.0.0/24"], enabledRoutes: ["10.0.0.0/24"] });
      }
      if (url === "https://api.tailscale.com/api/v2/tailnet/-/keys" && init?.method === "POST") {
        return Response.json({ id: "k123", key: "tskey-auth-secret" });
      }
      if (url === "https://api.tailscale.com/api/v2/device/n-delete" && init?.method === "DELETE") {
        return new Response(null, { status: 200 });
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
      credential: {
        authType: "custom_credential",
        values: { clientId: "client-id", clientSecret: "client-secret" },
        metadata: { tailnet: "-", verifiedDeviceCount: 1 },
      },
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

    const setRoutesAction = catalog.actionsById.get("tailscale.set_device_routes")!;
    const setRoutesExecutor = await providerLoader.loadActionExecutor(
      "tailscale",
      setRoutesAction.id,
      provider.displayName,
    );
    await expect(
      executeAction(
        setRoutesAction,
        setRoutesExecutor,
        { deviceId: "n123", routes: ["10.0.0.0/24"] },
        connections.forConnection("production"),
      ),
    ).resolves.toMatchObject({ ok: true, output: { enabledRoutes: ["10.0.0.0/24"] } });

    const createKeyAction = catalog.actionsById.get("tailscale.create_key")!;
    const createKeyExecutor = await providerLoader.loadActionExecutor(
      "tailscale",
      createKeyAction.id,
      provider.displayName,
    );
    await expect(
      executeAction(
        createKeyAction,
        createKeyExecutor,
        { key: { keyType: "auth", description: "CI key", expirySeconds: 3600 } },
        connections.forConnection("production"),
      ),
    ).resolves.toMatchObject({ ok: true, output: { id: "k123", key: "tskey-auth-secret" } });

    const deleteDeviceAction = catalog.actionsById.get("tailscale.delete_device")!;
    const deleteDeviceExecutor = await providerLoader.loadActionExecutor(
      "tailscale",
      deleteDeviceAction.id,
      provider.displayName,
    );
    await expect(
      executeAction(
        deleteDeviceAction,
        deleteDeviceExecutor,
        { deviceId: "n-delete" },
        connections.forConnection("production"),
      ),
    ).resolves.toEqual({ ok: true, output: null });

    expect(tokenRequests).toBe(10);
    expect(apiAuthorizations).toEqual([
      "Bearer tailscale-token-1",
      "Bearer tailscale-token-2",
      "Bearer tailscale-token-3",
      "Bearer tailscale-token-4",
      "Bearer tailscale-token-5",
      "Bearer tailscale-token-6",
      "Bearer tailscale-token-7",
      "Bearer tailscale-token-8",
      "Bearer tailscale-token-9",
      "Bearer tailscale-token-10",
    ]);
    const tokenBodies = fetcher.mock.calls
      .filter(([input]) => String(input) === "https://api.tailscale.com/api/v2/oauth/token")
      .map(([, init]) => Object.fromEntries(new URLSearchParams(String(init?.body))));
    const credential = { grant_type: "client_credentials", client_id: "client-id", client_secret: "client-secret" };
    // Credential validation omits `scope` entirely so that any OAuth client can connect; each action
    // then requests only the scopes that one call needs. Tailscale refuses to mint a token naming a
    // scope the client was never granted, so `create_key` asks for the one scope its `keyType`
    // requires rather than every scope the endpoint documents.
    expect(tokenBodies).toEqual([
      credential,
      { ...credential, scope: "devices:core:read" },
      { ...credential, scope: "devices:core:read" },
      { ...credential, scope: "logs:configuration:read" },
      { ...credential, scope: "policy_file:read" },
      { ...credential, scope: "users:read" },
      { ...credential, scope: "users:read" },
      { ...credential, scope: "devices:routes" },
      { ...credential, scope: "auth_keys" },
      { ...credential, scope: "devices:core" },
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
      "https://api.tailscale.com/api/v2/device/n123/routes",
      "https://api.tailscale.com/api/v2/tailnet/-/keys",
      "https://api.tailscale.com/api/v2/device/n-delete",
    ]);
    expect(apiMethods).toEqual(["GET", "GET", "GET", "GET", "POST", "GET", "GET", "POST", "POST", "DELETE"]);
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
    const routesCall = fetcher.mock.calls.find(
      ([input]) => String(input) === "https://api.tailscale.com/api/v2/device/n123/routes",
    );
    expect(routesCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ routes: ["10.0.0.0/24"] }),
      }),
    );
    const createKeyCall = fetcher.mock.calls.find(
      ([input]) => String(input) === "https://api.tailscale.com/api/v2/tailnet/-/keys",
    );
    expect(createKeyCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ keyType: "auth", description: "CI key", expirySeconds: 3600 }),
      }),
    );
    const deleteDeviceCall = fetcher.mock.calls.find(
      ([input]) => String(input) === "https://api.tailscale.com/api/v2/device/n-delete",
    );
    expect(deleteDeviceCall?.[1]).toEqual(expect.objectContaining({ method: "DELETE" }));
    expect(deleteDeviceCall?.[1]?.body).toBeUndefined();
    expect(provider.actions).toHaveLength(82);
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
    if (stored?.credential.authType !== "custom_credential") {
      throw new Error("expected a stored custom credential");
    }
    expect(stored.credential.metadata).toEqual({ tailnet: "-" });
    // The device probe is skipped rather than attempted-and-forgiven, so only the token exchange ran.
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual(["https://api.tailscale.com/api/v2/oauth/token"]);
  });

  it("creates an auth key with a credential scoped only for auth keys", async () => {
    setDefaultGuardedFetchDnsLookup(null);
    // The most common Tailscale OAuth client: provisioned to mint CI auth keys and nothing else.
    const held = new Set(["auth_keys"]);
    const requestedScopes: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.tailscale.com/api/v2/oauth/token") {
        const requested = new URLSearchParams(String(init?.body)).get("scope");
        if (requested !== null) {
          requestedScopes.push(requested);
          // Tailscale mints a token only for scopes the client was granted.
          const unheld = requested.split(/\s+/).filter((scope) => scope && !held.has(scope));
          if (unheld.length > 0) {
            return Response.json(
              { error: "invalid_scope", error_description: `client is not permitted scope ${unheld.join(" ")}` },
              { status: 400 },
            );
          }
        }
        return Response.json({
          access_token: "key-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: [...held].join(" "),
        });
      }
      if (url === "https://api.tailscale.com/api/v2/tailnet/-/keys" && init?.method === "POST") {
        return Response.json({ id: "k123", key: "tskey-auth-secret" });
      }
      return Response.json({ message: "not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    const catalog = createCatalogStore([provider], {
      executableActionIds: provider.actions.map((action) => action.id),
    });
    const providerLoader = new ProviderLoader({ tailscale: () => import("./executors.ts") });
    const connections = new ConnectionService({
      catalog,
      providerLoader,
      store: new MemoryConnectionStore(),
    });
    await connections.connectWithCustomCredential("tailscale", {
      connectionName: "keys-only",
      values: { clientId: "client-id", clientSecret: "client-secret" },
    });

    const action = catalog.actionsById.get("tailscale.create_key")!;
    const executor = await providerLoader.loadActionExecutor("tailscale", action.id, provider.displayName);
    // Requesting `oauth_keys` and `federated_keys` here as well would fail the token exchange outright,
    // even though this credential is perfectly able to create the auth key being asked for.
    await expect(
      executeAction(
        action,
        executor,
        { key: { keyType: "auth", description: "CI key", expirySeconds: 3600 } },
        connections.forConnection("keys-only"),
      ),
    ).resolves.toMatchObject({ ok: true, output: { id: "k123", key: "tskey-auth-secret" } });
    expect(requestedScopes).toEqual(["auth_keys"]);
  });

  it("returns the policy file with the etag that guards a later write", async () => {
    setDefaultGuardedFetchDnsLookup(null);
    const policy = { acls: [{ action: "accept", src: ["*"], dst: ["*:*"] }] };
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.tailscale.com/api/v2/oauth/token") {
        return Response.json({
          access_token: "policy-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "policy_file policy_file:read",
        });
      }
      if (url === "https://api.tailscale.com/api/v2/tailnet/-/acl" && (init?.method ?? "GET") === "GET") {
        return Response.json(policy, { headers: { etag: '"abc123"' } });
      }
      if (url === "https://api.tailscale.com/api/v2/tailnet/-/acl" && init?.method === "POST") {
        // Tailscale answers 412 when the policy moved on since the etag was read.
        if (new Headers(init?.headers).get("if-match") !== '"abc123"') {
          return Response.json({ message: "policy file has changed" }, { status: 412 });
        }
        return Response.json(policy);
      }
      return Response.json({ message: "not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    const catalog = createCatalogStore([provider], {
      executableActionIds: provider.actions.map((action) => action.id),
    });
    const providerLoader = new ProviderLoader({ tailscale: () => import("./executors.ts") });
    const connections = new ConnectionService({
      catalog,
      providerLoader,
      store: new MemoryConnectionStore(),
    });
    await connections.connectWithCustomCredential("tailscale", {
      connectionName: "policy",
      values: { clientId: "client-id", clientSecret: "client-secret" },
    });

    // The etag lives only in a response header, so the read has to hand it back for a safe write.
    const getAction = catalog.actionsById.get("tailscale.get_policy_file")!;
    const getExecutor = await providerLoader.loadActionExecutor("tailscale", getAction.id, provider.displayName);
    await expect(executeAction(getAction, getExecutor, {}, connections.forConnection("policy"))).resolves.toMatchObject(
      { ok: true, output: { policy, etag: '"abc123"' } },
    );

    const setAction = catalog.actionsById.get("tailscale.set_policy_file")!;
    const setExecutor = await providerLoader.loadActionExecutor("tailscale", setAction.id, provider.displayName);
    await expect(
      executeAction(setAction, setExecutor, { policy, ifMatch: '"abc123"' }, connections.forConnection("policy")),
    ).resolves.toMatchObject({ ok: true });
    // Only the policy reaches the body; the etag rides as If-Match.
    const write = fetcher.mock.calls.find(
      ([input, init]) => String(input) === "https://api.tailscale.com/api/v2/tailnet/-/acl" && init?.method === "POST",
    );
    expect(write?.[1]?.body).toBe(JSON.stringify(policy));
    expect(new Headers(write?.[1]?.headers).get("if-match")).toBe('"abc123"');

    // A stale etag is refused instead of silently overwriting a concurrent admin edit.
    await expect(
      executeAction(setAction, setExecutor, { policy, ifMatch: '"stale"' }, connections.forConnection("policy")),
    ).resolves.toMatchObject({ ok: false });
  });

  it("sends batched posture attributes under the nodes wrapper Tailscale requires", async () => {
    setDefaultGuardedFetchDnsLookup(null);
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.tailscale.com/api/v2/oauth/token") {
        return Response.json({
          access_token: "posture-token",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "devices:posture_attributes",
        });
      }
      if (url === "https://api.tailscale.com/api/v2/tailnet/-/device-attributes" && init?.method === "PATCH") {
        return new Response(null, { status: 200 });
      }
      return Response.json({ message: "not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    const catalog = createCatalogStore([provider], {
      executableActionIds: provider.actions.map((action) => action.id),
    });
    const providerLoader = new ProviderLoader({ tailscale: () => import("./executors.ts") });
    const connections = new ConnectionService({
      catalog,
      providerLoader,
      store: new MemoryConnectionStore(),
    });
    await connections.connectWithCustomCredential("tailscale", {
      connectionName: "posture",
      values: { clientId: "client-id", clientSecret: "client-secret" },
    });

    const action = catalog.actionsById.get("tailscale.batch_update_device_posture_attributes")!;
    const executor = await providerLoader.loadActionExecutor("tailscale", action.id, provider.displayName);
    await expect(
      executeAction(
        action,
        executor,
        { nodes: { n123: { "custom:score": { value: 7 } } }, comment: "bulk update" },
        connections.forConnection("posture"),
      ),
    ).resolves.toEqual({ ok: true, output: null });
    // Without the `nodes` wrapper Tailscale accepts the request and writes nothing, so the shape of
    // this body is the only thing standing between the caller and a silent no-op.
    const write = fetcher.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(write?.[1]?.body).toBe(
      JSON.stringify({ nodes: { n123: { "custom:score": { value: 7 } } }, comment: "bulk update" }),
    );
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
  private readonly connections = new Map<string, StoredConnection>();

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    return this.connections.get(`${service}:${connectionName}`);
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredConnection> {
    const key = `${service}:${connectionName}`;
    const connection = {
      id: this.connections.get(key)?.id ?? crypto.randomUUID(),
      service,
      connectionName,
      credential,
    };
    this.connections.set(key, connection);
    return connection;
  }

  async updateCredential(input: StoredConnection): Promise<boolean> {
    const key = `${input.service}:${input.connectionName}`;
    if (this.connections.get(key)?.id !== input.id) return false;
    this.connections.set(key, input);
    return true;
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.connections.delete(`${service}:${connectionName}`);
  }

  async list(): Promise<StoredConnection[]> {
    return [...this.connections.values()];
  }
}
