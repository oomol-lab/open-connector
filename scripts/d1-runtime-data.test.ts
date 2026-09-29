import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import worker from "../src/server/cloudflare/instance-maintenance-worker.ts";
import { D1RuntimeDatabase } from "../src/server/storage/d1/runtime-store.ts";
import { SqliteD1Database } from "../src/server/storage/d1/test-database.ts";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), readConfig: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("wrangler", () => ({ unstable_readConfig: mocks.readConfig }));
const directories: string[] = [];
const databases: SqliteD1Database[] = [];
const argv = process.argv;
const exitCode = process.exitCode;
afterEach(async () => {
  process.argv = argv;
  process.exitCode = exitCode;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const database of databases.splice(0)) database.close();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "d1-maintenance-cli-"));
  directories.push(directory);
  const operationFile = join(directory, "operation.json");
  const databaseId = crypto.randomUUID();
  const accountId = "a".repeat(32);
  const binding = new SqliteD1Database();
  databases.push(binding);
  const store = new D1RuntimeDatabase(binding).saasProjectStore;
  const oldId = await store.getInstanceId();
  mocks.readConfig.mockReturnValue({
    account_id: accountId,
    d1_databases: [{ binding: "DB", database_id: databaseId, database_name: "test-db" }],
  });
  let token = "";
  let resetCalls = 0;
  let deployed = false;
  const behavior = { loseResponse: false, wrongDatabase: false, failCleanup: false };
  mocks.spawn.mockImplementation((_bin: string, args: string[]) => {
    const child = new EventEmitter();
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    return Object.assign(child, {
      stdout,
      stderr,
      stdin: {
        end(input?: string) {
          void (async () => {
            const configPath = args[args.indexOf("--config") + 1];
            const config = JSON.parse(await readFile(configPath, "utf8"));
            if (!directories.includes(resolve(configPath, ".."))) directories.push(resolve(configPath, ".."));
            let output = "";
            let code = 0;
            if (args[1] === "d1")
              output = JSON.stringify({
                uuid: behavior.wrongDatabase ? crypto.randomUUID() : databaseId,
                name: "test-db",
              });
            if (args[1] === "deploy") {
              deployed = true;
              output = `https://${config.name}.test.workers.dev`;
            }
            if (args[1] === "secret") {
              token = input!;
              expect(args).not.toContain(token);
            }
            if (args[1] === "delete") {
              if (behavior.failCleanup) code = 1;
              else deployed = false;
            }
            stdout.emit("data", Buffer.from(output));
            child.emit("close", code);
          })().catch((error: unknown) => child.emit("error", error));
        },
      },
    });
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async (url, init) => {
      if (init?.method === "POST") {
        resetCalls++;
        const saved = JSON.parse(await readFile(operationFile, "utf8"));
        expect(saved.snapshot.instanceId).toBe(oldId);
        expect(JSON.parse(String(init.body))).toMatchObject({
          expectedInstanceId: saved.snapshot.instanceId,
          newInstanceId: saved.newInstanceId,
        });
      }
      const response = await worker.fetch(new Request(String(url), init), {
        DB: binding,
        TARGET_DATABASE_ID: databaseId,
        MAINTENANCE_TOKEN: token,
      });
      if (init?.method === "POST" && behavior.loseResponse) {
        behavior.loseResponse = false;
        throw new Error("response lost after commit");
      }
      return response;
    }),
  );
  const run = async (yes = true) => {
    process.argv = [
      process.execPath,
      resolve("scripts/d1-runtime-data.ts"),
      "reset-instance",
      "--config",
      "selected.jsonc",
      "--remote",
      "--operation-file",
      operationFile,
    ];
    if (yes) process.argv.push("--yes");
    await vi.resetModules();
    await import("./d1-runtime-data.ts");
  };
  return {
    store,
    oldId,
    operationFile,
    behavior,
    run,
    errorLog,
    resetCalls: () => resetCalls,
    deployed: () => deployed,
  };
}

it("persists reset identities before sending and retries a lost response as the same operation", async () => {
  const f = await setup();
  f.behavior.loseResponse = true;
  await expect(f.run()).rejects.toThrow("response lost");
  expect(f.deployed()).toBe(false);
  const saved = JSON.parse(await readFile(f.operationFile, "utf8"));
  expect(await f.store.getInstanceId()).toBe(saved.newInstanceId);
  expect(saved.completed).toBe(false);
  await f.run();
  expect(JSON.parse(await readFile(f.operationFile, "utf8"))).toMatchObject({
    newInstanceId: saved.newInstanceId,
    completed: true,
  });
  expect(f.resetCalls()).toBe(2);
  expect(f.deployed()).toBe(false);
});

it("inspects without resetting when --yes is omitted", async () => {
  const f = await setup();
  await f.run(false);
  expect(f.resetCalls()).toBe(0);
  expect(await f.store.getInstanceId()).toBe(f.oldId);
  expect(f.deployed()).toBe(false);
});

it("rejects the wrong remote database before deploying a maintenance endpoint", async () => {
  const f = await setup();
  f.behavior.wrongDatabase = true;
  await expect(f.run()).rejects.toThrow("database identity");
  expect(f.resetCalls()).toBe(0);
  expect(f.deployed()).toBe(false);
});

it("retains recovery state and reports a failed temporary Worker cleanup", async () => {
  const f = await setup();
  f.behavior.failCleanup = true;
  await f.run();
  expect(process.exitCode).toBe(1);
  expect(f.deployed()).toBe(true);
  expect(f.errorLog).toHaveBeenCalledWith(expect.stringContaining("Temporary Worker cleanup failed"));
  expect(JSON.parse(await readFile(f.operationFile, "utf8"))).toMatchObject({ completed: true });
  f.behavior.failCleanup = false;
  await f.run();
  expect(f.deployed()).toBe(false);
});
