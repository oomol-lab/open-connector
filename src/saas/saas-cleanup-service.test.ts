import { afterEach, expect, it, vi } from "vitest";
import { AesGcmSecretCodec } from "../server/secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "../server/storage/sqlite/runtime-store.ts";
import { SaasCleanupService } from "./saas-cleanup-service.ts";
import { SaasClient } from "./saas-client.ts";

const databases: SqliteRuntimeDatabase[] = [];
const workers: SaasCleanupService[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.close()));
  for (const database of databases.splice(0)) database.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function setup() {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const db = new SqliteRuntimeDatabase(":memory:", { secretCodec: new AesGcmSecretCodec("key") });
  databases.push(db);
  const project = { id: "managed", projectId: "project", baseUrl: "https://saas.example", apiKey: "private-key" };
  await db.saasProjectStore.saveProject(project);
  let requestId = "";
  const behavior = {
    requestStatus: "connected",
    mismatch: false,
    status: 200,
    wait: undefined as Promise<void> | undefined,
    deletes: 0,
  };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    await behavior.wait;
    if (behavior.status !== 200) return new Response("private upstream message", { status: behavior.status });
    if (init?.method === "DELETE") {
      behavior.deletes++;
      return Response.json({
        success: true,
        data: { connectedAccountId: String(url).split("/").at(-1)!.split("?")[0], deleted: true },
      });
    }
    return Response.json({
      success: true,
      data: {
        id: `remote-${requestId}`,
        status: behavior.requestStatus,
        projectId: project.projectId,
        providerConfigId: "config",
        externalUserId: behavior.mismatch ? "foreign-user" : "user",
        service: "example",
        alias: `connect-${requestId}`,
        authorizationUrl: "https://saas.example/authorize",
        connectedAccountId: behavior.requestStatus === "connected" ? "account" : null,
        errorCode: null,
        errorMessage: null,
        expiresAt: new Date(now + 600_000).toISOString(),
        createdAt: now,
        updatedAt: now,
      },
    });
  });
  const warn = vi.fn();
  const create = () => {
    const worker = new SaasCleanupService({
      store: db.saasProjectStore,
      requests: db.connectionRequestStore,
      client: new SaasClient(fetcher),
      logger: { info: vi.fn(), warn, error: vi.fn() },
    });
    workers.push(worker);
    return worker;
  };
  const queue = async (account = false, knownRequest = true, expired = false) => {
    requestId = crypto.randomUUID();
    const pending = {
      connectionRequestId: requestId,
      connectionId: crypto.randomUUID(),
      owner: requestId,
      service: "example",
      connectionName: requestId,
      managedProjectId: "managed",
      providerConfigId: "config",
      externalUserId: "user",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 600_000).toISOString(),
    };
    const lease = await db.connectionRequestStore.createSaas(pending);
    if (knownRequest) await db.connectionRequestStore.saveSaasRequest(lease, `remote-${requestId}`);
    if (account) {
      await db.connectionRequestStore.saveSaasCandidate(lease, {
        connectedAccountId: requestId,
        status: "active",
        comment: null,
        profile: { accountId: "user", displayName: "User", grantedScopes: [] },
      });
      await db.connectionRequestStore.completeSaas(lease);
      await db.connectionStore.delete("example", requestId);
      expect(await db.connectionStore.get("example", requestId)).toBeUndefined();
    } else if (!expired) await db.connectionRequestStore.cancelSaas(requestId, requestId);
    return pending;
  };
  return {
    db,
    project,
    behavior,
    fetcher,
    warn,
    create,
    queue,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

it("deletes the exact queued account using ordinary idempotent project deletion", async () => {
  const f = await setup();
  const pending = await f.queue(true);
  await f.create().run();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = f.fetcher.mock.calls[0];
  expect(String(url)).toBe(
    `https://saas.example/v1/saas/connected-accounts/${pending.connectionRequestId}?providerConfigId=config&userId=user`,
  );
  expect(init?.method).toBe("DELETE");
  expect(await f.db.saasProjectStore.getCleanupStats()).toEqual({ pending: 0, manual: 0, paused: false });
});

it("persists a recovered account before deleting and resumes from it after a failed local finish", async () => {
  const f = await setup();
  await f.queue();
  vi.spyOn(f.db.saasProjectStore, "finishCleanup").mockRejectedValueOnce(new Error("database interrupted"));
  await f.create().run();
  expect(f.behavior.deletes).toBe(1);
  expect((await f.db.saasProjectStore.getCleanupStats()).pending).toBe(1);
  f.advance(61_000);
  await f.create().run();
  expect(f.behavior.deletes).toBe(2);
  expect(f.fetcher.mock.calls.filter(([, init]) => init?.method !== "DELETE")).toHaveLength(1);
  expect((await f.db.saasProjectStore.getCleanupStats()).pending).toBe(0);
});

it.each([404, "mismatch"])("keeps unverifiable authorization %s for manual cleanup", async (failure) => {
  const f = await setup();
  await f.queue();
  if (failure === 404) f.behavior.status = 404;
  else f.behavior.mismatch = true;
  await f.create().run();
  expect(f.behavior.deletes).toBe(0);
  expect(await f.db.saasProjectStore.getCleanupStats()).toMatchObject({ pending: 0, manual: 1 });
});

it("retains unknown creation outcomes without contacting SaaS", async () => {
  const f = await setup();
  await f.queue(false, false);
  await f.create().run();
  expect(f.fetcher).not.toHaveBeenCalled();
  expect((await f.db.saasProjectStore.getCleanupStats()).manual).toBe(1);
});

it("expires abandoned local requests into cleanup without dropping known remote references", async () => {
  const f = await setup();
  await f.queue(false, true, true);
  f.advance(25 * 60 * 60 * 1000);
  await f.create().run();
  expect(f.behavior.deletes).toBe(1);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it("waits for pending authorization and finishes a terminal failure without deleting an account", async () => {
  const f = await setup();
  await f.queue();
  f.behavior.requestStatus = "initiated";
  const worker = f.create();
  await worker.run();
  await worker.run();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  f.advance(61_000);
  f.behavior.requestStatus = "failed";
  await worker.run();
  expect(f.behavior.deletes).toBe(0);
  expect((await f.db.saasProjectStore.getCleanupStats()).pending).toBe(0);
});

it("pauses the project on a rejected key and resumes after key replacement", async () => {
  const f = await setup();
  await f.queue(true);
  await f.queue(true);
  f.behavior.status = 401;
  const worker = f.create();
  await worker.run();
  await worker.run();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect((await f.db.saasProjectStore.getCleanupStats()).paused).toBe(true);
  expect(JSON.stringify(f.warn.mock.calls)).not.toContain("private");
  await f.db.saasProjectStore.saveProject({ ...f.project, apiKey: "new-key" });
  f.behavior.status = 200;
  f.advance(61_000);
  await worker.run();
  expect(f.behavior.deletes).toBe(2);
  expect((await f.db.saasProjectStore.getCleanupStats()).paused).toBe(false);
});

it("retains work during outages and respects persisted retry timing across workers", async () => {
  const f = await setup();
  await f.queue(true);
  f.behavior.status = 500;
  await f.create().run();
  await f.create().run();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  f.advance(61_000);
  f.behavior.status = 200;
  await f.create().run();
  expect(f.behavior.deletes).toBe(1);
  expect((await f.db.saasProjectStore.getCleanupStats()).pending).toBe(0);
});

it("bounds each batch and resumes remaining work in a later batch", async () => {
  const f = await setup();
  for (let i = 0; i < 11; i++) await f.queue(true);
  const worker = f.create();
  await worker.run();
  expect(f.behavior.deletes).toBe(10);
  expect((await f.db.saasProjectStore.getCleanupStats()).pending).toBe(1);
  await worker.run();
  expect(f.behavior.deletes).toBe(11);
});

it("uses leases across workers and tolerates a duplicate deletion after an expired lease", async () => {
  const f = await setup();
  await f.queue(true);
  let finish!: () => void;
  f.behavior.wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const first = f.create().run();
  await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(1));
  await f.create().run();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  f.advance(46_000);
  f.behavior.wait = undefined;
  await f.create().run();
  finish();
  await first;
  expect(f.behavior.deletes).toBe(2);
  expect((await f.db.saasProjectStore.getCleanupStats()).pending).toBe(0);
});

it("stops and waits for in-flight cleanup before storage can be closed", async () => {
  const f = await setup();
  await f.queue(true);
  f.behavior.wait = new Promise(() => {});
  const worker = f.create();
  const pending = worker.run();
  await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledOnce());
  await worker.close();
  await pending;
  expect(f.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect((await f.db.saasProjectStore.getCleanupStats()).pending).toBe(1);
  await worker.run();
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it("continues running on the Node timer without requests and stops scheduling on close", async () => {
  const f = await setup();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const worker = f.create();
  worker.start();
  await worker.run();
  await f.queue(true);
  f.advance(60_000);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.behavior.deletes).toBe(1);
  await worker.close();
  await f.queue(true);
  f.advance(60_000);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.behavior.deletes).toBe(1);
});
