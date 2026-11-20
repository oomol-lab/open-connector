import type { ConnectorRuntime, ConnectorRuntimeOptions } from "./connector-runtime.ts";

import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectorRuntime } from "./connector-runtime.ts";

const publicOrigin = "https://host.example";
const directories: string[] = [];
let runtime: ConnectorRuntime | undefined;

afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

interface Tenant {
  token: string;
  alias: string;
  connectionId: string;
  apiKey: string;
}

describe("scope isolation", () => {
  it("lets a scoped token see and run only the connections of its own scope", async () => {
    const fetcher = stubProvider();
    runtime = await createConnectorRuntime(await fixture());
    const a = await tenant("tenant-a", "key-a");
    const b = await tenant("tenant-b", "key-b");
    fetcher.mockClear();

    const apps = await call("/v1/apps", undefined, a.token);
    expect(((await apps.json()).data as Array<{ alias: string }>).map((app) => app.alias)).toEqual([a.alias]);

    const own = await execute(a.token, a.alias);
    expect(own.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![1]?.headers).toMatchObject({ authorization: "Bearer key-a" });
    expect((await execute(a.token, undefined, a.connectionId)).status).toBe(200);

    fetcher.mockClear();
    const crossAlias = await execute(a.token, b.alias);
    const crossId = await execute(a.token, undefined, b.connectionId);
    const missing = await execute(a.token, "does-not-exist");
    // Another scope's connection is never read, so it answers exactly like one that does not exist.
    expect(fetcher).not.toHaveBeenCalled();
    expect(missing.status).toBe(404);
    const { errorCode } = await missing.json();
    for (const response of [crossAlias, crossId]) {
      expect(response.status).toBe(404);
      expect((await response.json()).errorCode).toBe(errorCode);
    }
  });

  it("fails closed for an unscoped token: it cannot use scoped connections", async () => {
    const fetcher = stubProvider();
    runtime = await createConnectorRuntime(await fixture());
    const a = await tenant("tenant-a", "key-a");
    const unscoped = await createToken();
    fetcher.mockClear();

    const apps = await call("/v1/apps", undefined, unscoped);
    expect((await apps.json()).data).toEqual([]);
    // Search does not reveal that another scope has connected the provider.
    const found = await (await call("/v1/actions/search?q=credit&service=ninjapear", undefined, unscoped)).json();
    expect(found.data.length).toBeGreaterThan(0);
    expect(found.data.every((item: { authenticated: boolean }) => !item.authenticated)).toBe(true);
    const own = await (await call("/v1/actions/search?q=credit&service=ninjapear", undefined, a.token)).json();
    expect(own.data.some((item: { authenticated: boolean }) => item.authenticated)).toBe(true);
    const response = await execute(unscoped, a.alias);
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("confines the static runtime token, which has no scope, to unscoped connections", async () => {
    const fetcher = stubProvider();
    runtime = await createConnectorRuntime(await fixture());
    const a = await tenant("tenant-a", "key-a");
    fetcher.mockClear();

    expect((await (await call("/v1/apps", undefined, "runtime-token")).json()).data).toEqual([]);
    expect((await execute("runtime-token", a.alias)).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not let an empty allowedConnections list widen a scoped token", async () => {
    const fetcher = stubProvider();
    runtime = await createConnectorRuntime(await fixture());
    const a = await tenant("tenant-a", "key-a");
    const b = await tenant("tenant-b", "key-b");
    // `tenant()` creates tokens with allowedConnections: [], which means "any connection" for an unscoped token.
    fetcher.mockClear();
    expect((await execute(a.token, b.alias)).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an invalid or empty scope and refuses to change the scope of an existing token", async () => {
    runtime = await createConnectorRuntime(await fixture());
    for (const scope of ["", " ", "has space", "x".repeat(129)]) {
      const response = await call("/api/runtime-tokens", tokenBody({ scope }), "admin-token");
      expect(response.status).toBe(400);
    }
    const created = await (await call("/api/runtime-tokens", tokenBody({ scope: "tenant-a" }), "admin-token")).json();
    const update = await call(
      `/api/runtime-tokens/${created.record.id}`,
      { ...tokenBody({}), scope: "tenant-b" },
      "admin-token",
      "PUT",
    );
    expect(update.status).toBe(400);
  });

  it("refuses to adopt a connection that exists in another scope", async () => {
    stubProvider();
    runtime = await createConnectorRuntime(await fixture());
    const a = await tenant("tenant-a", "key-a");
    const reconnect = await call(
      `/v1/connections/by-id/${a.connectionId}/connect/api-key`,
      { apiKey: "key-a-rotated", scope: "tenant-b" },
      "admin-token",
    );
    // A reconnect keeps the scope of its target; naming another scope is rejected, not ignored.
    expect(reconnect.status).toBe(400);
    expect((await reconnect.json()).errorCode).toBe("invalid_input");
    const kept = await call(`/v1/connections/by-id/${a.connectionId}`, undefined, "admin-token");
    expect((await kept.json()).data.scope).toBe("tenant-a");
  });

  it("namespaces idempotency keys per scope so one tenant cannot collide with or replay another's key", async () => {
    const fetcher = stubProvider();
    runtime = await createConnectorRuntime(await fixture());
    const a = await tenant("tenant-a", "key-a");
    const b = await tenant("tenant-b", "key-b");
    const base = fetcher.mock.calls.length;
    const key = { "idempotency-key": "shared-key" };
    expect((await execute(a.token, a.alias, undefined, key)).status).toBe(200);
    // Same key from another scope is a fresh request: no 409 oracle, no replayed response.
    expect((await execute(b.token, b.alias, undefined, key)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(base + 2);
    // Within one scope the key still replays.
    expect((await execute(a.token, a.alias, undefined, key)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(base + 2);
  });

  it("records the scope on runs, lists them per scope, and purges one scope without touching another", async () => {
    stubProvider();
    runtime = await createConnectorRuntime(await fixture());
    const a = await tenant("tenant-a", "key-a");
    const b = await tenant("tenant-b", "key-b");
    await execute(a.token, a.alias);
    await execute(a.token, a.alias);
    await execute(b.token, b.alias);

    const listA = await (await call("/api/runs?scope=tenant-a", undefined, "admin-token")).json();
    expect(listA.items).toHaveLength(2);
    expect(listA.items.every((run: { scope: string }) => run.scope === "tenant-a")).toBe(true);
    expect((await (await call("/api/runs?scope=tenant-b", undefined, "admin-token")).json()).items).toHaveLength(1);

    expect((await call("/api/runs", undefined, "admin-token", "DELETE")).status).toBe(400);
    const purge = await call("/api/runs?scope=tenant-a", undefined, "admin-token", "DELETE");
    expect(await purge.json()).toEqual({ scope: "tenant-a", deleted: 2 });
    expect((await (await call("/api/runs?scope=tenant-a", undefined, "admin-token")).json()).items).toEqual([]);
    expect((await (await call("/api/runs?scope=tenant-b", undefined, "admin-token")).json()).items).toHaveLength(1);
  });
  it("serves a scoped transit file only to its own scope, and keeps unscoped files downloadable", async () => {
    stubProvider();
    runtime = await createConnectorRuntime(await fixture());
    const a = await tenant("tenant-a", "key-a");
    const b = await tenant("tenant-b", "key-b");
    const scoped = await upload("a.txt", "alpha", "tenant-a");
    const plain = await upload("p.txt", "plain");

    const download = async (fileId: string, token?: string) =>
      runtime!.fetch(
        new Request(
          `${publicOrigin}/api/files/${fileId}`,
          token ? { headers: { authorization: `Bearer ${token}` } } : {},
        ),
      );
    expect((await download(scoped)).status).toBe(404);
    expect((await download(scoped, b.token)).status).toBe(404);
    expect((await download(scoped, "runtime-token")).status).toBe(404);
    expect(await (await download(scoped, a.token)).text()).toBe("alpha");
    expect(await (await download(scoped, "admin-token")).text()).toBe("alpha");
    // An unscoped file keeps its public, unguessable-id download.
    expect(await (await download(plain)).text()).toBe("plain");
    expect((await download(plain, a.token)).status).toBe(404);

    // Another scope cannot delete it; its own scope can.
    const remove = (token: string) =>
      runtime!.fetch(
        new Request(`${publicOrigin}/api/files/${scoped}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        }),
      );
    expect(await (await remove(b.token)).json()).toMatchObject({ deleted: false });
    expect(await (await remove(a.token)).json()).toMatchObject({ deleted: true });
  });

  it("deletes a scope: tokens, connections, runs and files go, other scopes stay", async () => {
    stubProvider();
    runtime = await createConnectorRuntime(await fixture());
    const a = await tenant("tenant-a", "key-a");
    const b = await tenant("tenant-b", "key-b");
    await execute(a.token, a.alias);
    await execute(b.token, b.alias);
    const fileA = await upload("a.txt", "alpha", "tenant-a");
    const fileB = await upload("b.txt", "beta", "tenant-b");

    expect((await call("/api/scopes/has space", undefined, "admin-token", "DELETE")).status).toBe(400);
    const removed = await call("/api/scopes/tenant-a", undefined, "admin-token", "DELETE");
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({
      scope: "tenant-a",
      complete: true,
      deleted: {
        runtimeTokens: 1,
        connectionRequests: 0,
        triggerSubscriptions: 0,
        connections: 1,
        runs: 1,
        transitFiles: 1,
      },
      failures: [],
    });

    expect((await execute(a.token, a.alias)).status).toBe(401);
    const connections = (await (await call("/v1/connections", undefined, "admin-token")).json()).data as Array<{
      scope?: string;
    }>;
    expect(connections.some((connection) => connection.scope === "tenant-a")).toBe(false);
    expect((await (await call("/api/runs?scope=tenant-a", undefined, "admin-token")).json()).items).toEqual([]);
    const fetchFile = (id: string) =>
      runtime!.fetch(
        new Request(`${publicOrigin}/api/files/${id}`, { headers: { authorization: "Bearer admin-token" } }),
      );
    expect((await fetchFile(fileA)).status).toBe(404);
    // The other scope is untouched.
    expect((await execute(b.token, b.alias)).status).toBe(200);
    expect(await (await fetchFile(fileB)).text()).toBe("beta");
  });
  it("deletes only the scope's stored connections, never a shared default, and the console keeps a scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ status: "ok", message: {}, credit_balance: 100 }, { headers: { "x-api-pool": "plus" } }),
      ),
    );
    runtime = await createConnectorRuntime(await fixture(["crossref"]));
    // crossref works without a key, so tenant-a's listing offers a virtual `default` for it.
    const shared = await call(
      "/api/connections/crossref",
      { authType: "api_key", values: { apiKey: "shared" } },
      "admin-token",
      "PUT",
    );
    expect(shared.status).toBe(200);
    const a = await tenant("tenant-a", "key-a");

    // Replacing a scoped connection from the console keeps its scope.
    const edited = await call(
      "/api/connections/ninjapear",
      { authType: "api_key", values: { apiKey: "rotated" }, connectionName: a.alias },
      "admin-token",
      "PUT",
    );
    expect(edited.status).toBe(200);
    const kept = await (await call(`/v1/connections/by-id/${a.connectionId}`, undefined, "admin-token")).json();
    expect(kept.data.scope).toBe("tenant-a");

    const removed = await (await call("/api/scopes/tenant-a", undefined, "admin-token", "DELETE")).json();
    expect(removed.deleted.connections).toBe(1);
    const left = (await (await call("/v1/connections", undefined, "admin-token")).json()).data as Array<{
      service: string;
    }>;
    expect(left.map((connection) => connection.service)).toEqual(["crossref"]);
  });
});

describe("tenant connect tokens", () => {
  it("lets a token with allowConnect connect and read only inside its own scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ credit_balance: 100 })),
    );
    runtime = await createConnectorRuntime(await fixture());
    const a = await createToken({ scope: "tenant-a", allowConnect: true });
    const b = await createToken({ scope: "tenant-b", allowConnect: true });

    // The scope comes from the token: the body does not need it, and naming the same scope is accepted.
    const connectedA = await call("/v1/connections/ninjapear/connect/api-key", { apiKey: "key-a" }, a);
    expect(connectedA.status).toBe(200);
    const appA = (await connectedA.json()).data as { id: string; scope: string };
    expect(appA.scope).toBe("tenant-a");
    const sameScope = await call(
      "/v1/connections/ninjapear/connect/api-key",
      { apiKey: "key-a2", scope: "tenant-a" },
      a,
    );
    expect(sameScope.status).toBe(200);
    const appB = (await (await call("/v1/connections/ninjapear/connect/api-key", { apiKey: "key-b" }, b)).json()).data;

    // A tenant cannot choose another scope, however it asks.
    const other = await call("/v1/connections/ninjapear/connect/api-key", { apiKey: "x", scope: "tenant-b" }, a);
    expect(other.status).toBe(400);
    expect((await other.json()).errorCode).toBe("invalid_input");

    // Reads are filtered to the token's scope; another tenant's connection is indistinguishable from a missing one.
    const listed = (await (await call("/v1/connections", undefined, a)).json()).data as Array<{ scope: string }>;
    expect(listed.length).toBe(2);
    expect(listed.every((connection) => connection.scope === "tenant-a")).toBe(true);
    expect((await call(`/v1/connections/by-id/${appA.id}`, undefined, a)).status).toBe(200);
    const crossRead = await call(`/v1/connections/by-id/${appB.id}`, undefined, a);
    const missingRead = await call("/v1/connections/by-id/does-not-exist", undefined, a);
    expect(crossRead.status).toBe(404);
    expect(await crossRead.json()).toMatchObject({ errorCode: "app_not_found" });
    expect(missingRead.status).toBe(404);
    // Another tenant's connection cannot be overwritten through a reconnect either.
    const crossReconnect = await call(`/v1/connections/by-id/${appB.id}/connect/api-key`, { apiKey: "hijack" }, a);
    expect(crossReconnect.status).toBe(404);
    // The administrator still sees every scope.
    const all = (await (await call("/v1/connections", undefined, "admin-token")).json()).data as unknown[];
    expect(all.length).toBe(3);
  });

  it("keeps everything else administrator-only and fails closed without allowConnect", async () => {
    runtime = await createConnectorRuntime(await fixture());
    const scopedOnly = await createToken({ scope: "tenant-a" });
    const connectToken = await createToken({ scope: "tenant-a", allowConnect: true });
    const unscoped = await createToken({});

    for (const token of [scopedOnly, unscoped, "runtime-token"]) {
      expect((await call("/v1/connections", undefined, token)).status).toBe(401);
      expect((await call("/v1/connections/ninjapear/connect/api-key", { apiKey: "k" }, token)).status).toBe(401);
    }
    // Outside the tenant subset, a connect token is as limited as any runtime token.
    for (const path of ["/api/runtime-tokens", "/api/runs", "/api/connections", "/api/custom-mcp"]) {
      expect((await call(path, undefined, connectToken)).status).toBeGreaterThanOrEqual(401);
    }
    expect((await call("/api/runtime-tokens", undefined, connectToken)).status).not.toBe(200);

    // allowConnect needs a scope, and neither field can be changed on an existing token.
    const noScope = await call("/api/runtime-tokens", tokenBody({ allowConnect: true }), "admin-token");
    expect(noScope.status).toBe(400);
    const record = await (await call("/api/runtime-tokens", tokenBody({ scope: "tenant-z" }), "admin-token")).json();
    const update = await call(
      `/api/runtime-tokens/${record.record.id}`,
      { ...tokenBody({}), allowConnect: true },
      "admin-token",
      "PUT",
    );
    expect(update.status).toBe(400);
  });

  it("scopes OAuth connection requests to the tenant that started them", async () => {
    runtime = await createConnectorRuntime(await fixture());
    await call("/api/oauth/configs/github", { clientId: "client", clientSecret: "secret" }, "admin-token", "PUT");
    const a = await createToken({ scope: "tenant-a", allowConnect: true });
    const b = await createToken({ scope: "tenant-b", allowConnect: true });

    const started = await call("/v1/connections/github/connect", {}, a);
    expect(started.status).toBe(200);
    const { connectionRequestId, authorizationUrl } = (await started.json()).data;
    expect(authorizationUrl).toContain("github.com");

    expect((await call(`/v1/connection-requests/${connectionRequestId}`, undefined, a)).status).toBe(200);
    // Another tenant sees no such request; the administrator sees every request.
    expect((await call(`/v1/connection-requests/${connectionRequestId}`, undefined, b)).status).toBe(404);
    expect((await call(`/v1/connection-requests/${connectionRequestId}`)).status).toBe(200);
    // A second tenant starting the same provider does not supersede the first tenant's pending request.
    expect((await call("/v1/connections/github/connect", {}, b)).status).toBe(200);
    const stillPending = await (await call(`/v1/connection-requests/${connectionRequestId}`, undefined, a)).json();
    expect(stillPending.data.status).toBe("initiated");
    // A tenant cannot name another scope when starting OAuth.
    expect((await call("/v1/connections/github/connect", { scope: "tenant-b" }, a)).status).toBe(400);
    // Nor override the administrator's client configuration or return address.
    for (const body of [{ returnUri: "https://example.org/" }, { extra: { instanceUrl: "https://example.org" } }])
      expect((await call("/v1/connections/github/connect", body, a)).status).toBe(400);

    // Deleting the scope fails its pending request, so a late callback cannot store a connection in it.
    const removed = await (await call("/api/scopes/tenant-a", undefined, "admin-token", "DELETE")).json();
    expect(removed.deleted.connectionRequests).toBe(1);
    const cancelled = await (await call(`/v1/connection-requests/${connectionRequestId}`)).json();
    expect(cancelled.data).toMatchObject({ status: "failed", errorCode: "scope_deleted" });
  });
});

async function upload(name: string, content: string, scope?: string): Promise<string> {
  const form = new FormData();
  form.set("file", new File([content], name, { type: "text/plain" }));
  const response = await runtime!.fetch(
    new Request(`${publicOrigin}/api/files${scope ? `?scope=${scope}` : ""}`, {
      method: "POST",
      headers: { authorization: "Bearer admin-token" },
      body: form,
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()).fileId;
}

function stubProvider(): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ credit_balance: 100 }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function tokenBody(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    name: "test",
    allowedActions: [],
    blockedActions: [],
    allowedProxies: [],
    allowedConnections: [],
    ...extra,
  };
}

async function createToken(extra: Record<string, unknown> = {}): Promise<string> {
  const response = await call("/api/runtime-tokens", tokenBody(extra), "admin-token");
  expect(response.status).toBe(200);
  return (await response.json()).token;
}

async function tenant(scope: string, apiKey: string): Promise<Tenant> {
  const connected = await call("/v1/connections/ninjapear/connect/api-key", { apiKey, scope }, "admin-token");
  expect(connected.status).toBe(200);
  const body = (await connected.json()).data;
  expect(body.scope).toBe(scope);
  return { token: await createToken({ scope }), alias: body.alias, connectionId: body.id, apiKey };
}

function execute(
  token: string,
  alias?: string,
  connectionId?: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return runtime!.fetch(
    new Request(`${publicOrigin}/v1/actions/ninjapear.get_credit_balance`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        ...(alias ? { "x-oo-connector-alias": alias } : {}),
        ...(connectionId ? { "x-oo-connector-app-id": connectionId } : {}),
        ...headers,
      },
      body: JSON.stringify({ input: {} }),
    }),
  );
}

function call(path: string, body?: unknown, token = "admin-token", method = body ? "POST" : "GET"): Promise<Response> {
  return runtime!.fetch(
    new Request(`${publicOrigin}${path}`, {
      method,
      headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function fixture(services: string[] = []): Promise<ConnectorRuntimeOptions> {
  const root = await mkdtemp(join(tmpdir(), "open-connector-scope-"));
  directories.push(root);
  const catalogDir = join(root, "catalog");
  await mkdir(catalogDir);
  for (const service of ["ninjapear", "github", ...services]) {
    await cp(resolve(import.meta.dirname, `../../catalog/apps/${service}.json`), join(catalogDir, `${service}.json`));
  }
  return {
    dataDir: join(root, "state"),
    publicOrigin,
    encryptionKey: "fixture-encryption-key",
    adminToken: "admin-token",
    runtimeToken: "runtime-token",
    assets: { catalogDir, migrationDirectory: resolve(import.meta.dirname, "../../migrations") },
  };
}
