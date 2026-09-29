import { afterEach, expect, it, vi } from "vitest";
import { AesGcmSecretCodec } from "../secrets/secret-codec.ts";
import { D1RuntimeDatabase } from "../storage/d1/runtime-store.ts";
import { SqliteD1Database } from "../storage/d1/test-database.ts";
import worker from "./instance-maintenance-worker.ts";

const bindings: SqliteD1Database[] = [];
afterEach(() => {
  for (const binding of bindings.splice(0)) binding.close();
  vi.restoreAllMocks();
});
async function setup() {
  const binding = new SqliteD1Database();
  bindings.push(binding);
  const database = new D1RuntimeDatabase(binding, { secretCodec: new AesGcmSecretCodec("existing-key") });
  const project = { id: "managed", projectId: "project", baseUrl: "https://saas.example", apiKey: "secret" };
  await database.saasProjectStore.saveProject(project);
  const oldId = await database.saasProjectStore.getInstanceId();
  const env = { DB: binding, TARGET_DATABASE_ID: crypto.randomUUID(), MAINTENANCE_TOKEN: "temporary-secret" };
  const body = { databaseId: env.TARGET_DATABASE_ID, expectedInstanceId: oldId, newInstanceId: crypto.randomUUID() };
  const reset = (input = body) =>
    worker.fetch(
      new Request("https://maintenance.example/reset-instance", {
        method: "POST",
        headers: { authorization: "Bearer temporary-secret", "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
      env,
    );
  return { binding, database, project, env, body, reset };
}

it("authenticates and pins the database before accessing D1", async () => {
  const f = await setup();
  const batch = vi.spyOn(f.binding, "batch");
  const unauthorized = await worker.fetch(new Request("https://maintenance.example/inspect"), f.env);
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.headers.get("cache-control")).toBe("private, no-store");
  expect((await f.reset({ ...f.body, databaseId: crypto.randomUUID() })).status).toBe(409);
  expect(batch).not.toHaveBeenCalled();
  expect((await f.reset({ ...f.body, expectedInstanceId: f.body.newInstanceId })).status).toBe(400);
});

it("atomically rolls back earlier deletes when a later D1 batch statement fails", async () => {
  const f = await setup();
  await f.database.saasProjectStore.setSource("example", { managedProjectId: "managed", providerConfigId: "config" });
  f.binding.exec(
    "create trigger fail_reset before delete on managed_project begin select raise(abort, 'injected failure'); end",
  );
  const batch = vi.spyOn(f.binding, "batch");
  expect((await f.reset()).status).toBe(500);
  expect(batch).toHaveBeenCalledTimes(1);
  expect(batch.mock.calls[0][0]).toHaveLength(7);
  expect(await f.database.saasProjectStore.getInstanceId()).toBe(f.body.expectedInstanceId);
  expect(await f.database.saasProjectStore.getSource("example")).toBeDefined();
  expect(await f.database.saasProjectStore.getProject()).toEqual(f.project);
  f.binding.exec("drop trigger fail_reset");
  expect((await f.reset()).status).toBe(200);
});

it("recovers a lost reset response without deleting data created after the committed operation", async () => {
  const f = await setup();
  await f.reset();
  await f.database.saasProjectStore.saveProject(f.project);
  const response = await f.reset();
  expect(await response.json()).toEqual({
    databaseId: f.env.TARGET_DATABASE_ID,
    instanceId: f.body.newInstanceId,
    result: "already_reset",
  });
  expect(await f.database.saasProjectStore.getProject()).toEqual(f.project);
});

it("allows one of two competing new identities and rejects the other", async () => {
  const f = await setup();
  const results = await Promise.all([f.reset(), f.reset({ ...f.body, newInstanceId: crypto.randomUUID() })]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const winner = await results.find((result) => result.status === 200)!.json();
  expect(await f.database.saasProjectStore.getInstanceId()).toBe(winner.instanceId);
});

it("inspects counts without requiring the production encryption key or making remote calls", async () => {
  const f = await setup();
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No egress"));
  const response = await worker.fetch(
    new Request(`https://maintenance.example/inspect?databaseId=${f.env.TARGET_DATABASE_ID}`, {
      headers: { authorization: "Bearer temporary-secret" },
    }),
    f.env,
  );
  expect(await response.json()).toMatchObject({ instanceId: f.body.expectedInstanceId, projects: 1, connections: 0 });
  expect((await f.reset()).status).toBe(200);
  expect(fetcher).not.toHaveBeenCalled();
});
