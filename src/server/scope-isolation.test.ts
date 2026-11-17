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
    // A reconnect keeps the scope of its target; the request cannot move the connection.
    expect(reconnect.status).toBe(200);
    expect((await reconnect.json()).data.scope).toBe("tenant-a");
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
});

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

async function createToken(scope?: string): Promise<string> {
  const response = await call("/api/runtime-tokens", tokenBody(scope === undefined ? {} : { scope }), "admin-token");
  expect(response.status).toBe(200);
  return (await response.json()).token;
}

async function tenant(scope: string, apiKey: string): Promise<Tenant> {
  const connected = await call("/v1/connections/ninjapear/connect/api-key", { apiKey, scope }, "admin-token");
  expect(connected.status).toBe(200);
  const body = (await connected.json()).data;
  expect(body.scope).toBe(scope);
  return { token: await createToken(scope), alias: body.alias, connectionId: body.id, apiKey };
}

function execute(token: string, alias?: string, connectionId?: string): Promise<Response> {
  return runtime!.fetch(
    new Request(`${publicOrigin}/v1/actions/ninjapear.get_credit_balance`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        ...(alias ? { "x-oo-connector-alias": alias } : {}),
        ...(connectionId ? { "x-oo-connector-app-id": connectionId } : {}),
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

async function fixture(): Promise<ConnectorRuntimeOptions> {
  const root = await mkdtemp(join(tmpdir(), "open-connector-scope-"));
  directories.push(root);
  const catalogDir = join(root, "catalog");
  await mkdir(catalogDir);
  await cp(resolve(import.meta.dirname, "../../catalog/apps/ninjapear.json"), join(catalogDir, "ninjapear.json"));
  return {
    dataDir: join(root, "state"),
    publicOrigin,
    encryptionKey: "fixture-encryption-key",
    adminToken: "admin-token",
    runtimeToken: "runtime-token",
    assets: { catalogDir, migrationDirectory: resolve(import.meta.dirname, "../../migrations") },
  };
}
