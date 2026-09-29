import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { unstable_readConfig } from "wrangler";
import { z } from "zod";

const snapshotSchema = z.object({
  databaseId: z.uuid(),
  instanceId: z.uuid(),
  connections: z.number().int().nonnegative(),
  requests: z.number().int().nonnegative(),
  sources: z.number().int().nonnegative(),
  projects: z.number().int().nonnegative(),
  cleanup: z.number().int().nonnegative(),
});
const operationSchema = z.strictObject({
  accountId: z.string().regex(/^[a-f0-9]{32}$/i),
  databaseId: z.uuid(),
  databaseName: z.string().min(1),
  newInstanceId: z.uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: snapshotSchema.optional(),
  completed: z.boolean(),
});

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string" },
    env: { type: "string" },
    remote: { type: "boolean" },
    yes: { type: "boolean" },
    "operation-file": { type: "string" },
  },
});
if (positionals.length !== 1 || positionals[0] !== "reset-instance" || !values.config || !values.remote)
  throw new Error(
    "Usage: node scripts/d1-runtime-data.ts reset-instance --config <wrangler.jsonc> [--env name] --remote [--yes] [--operation-file path]. Stop all writers first; --yes confirms they are stopped. Omit --yes to inspect only.",
  );
const config = z
  .object({
    account_id: z.string().optional(),
    compatibility_date: z.string().optional(),
    d1_databases: z.array(
      z.object({ binding: z.string(), database_id: z.string().optional(), database_name: z.string().optional() }),
    ),
  })
  .parse(unstable_readConfig({ config: resolve(values.config), env: values.env }));
const bindings = config.d1_databases.filter((binding) => binding.binding === "DB");
if (bindings.length !== 1) throw new Error("The selected configuration must contain exactly one DB binding.");
const binding = bindings[0];
const databaseId = z.uuid().parse(binding.database_id);
const databaseName = z.string().min(1).parse(binding.database_name);
const accountId = z
  .string()
  .regex(/^[a-f0-9]{32}$/i)
  .parse(config.account_id || process.env.CLOUDFLARE_ACCOUNT_ID);
const operationFile = resolve(values["operation-file"] ?? `.tmp/d1-reset-${databaseId}.json`);
await mkdir(dirname(operationFile), { recursive: true, mode: 0o700 });
let operation: z.infer<typeof operationSchema>;
try {
  operation = operationSchema.parse(JSON.parse(await readFile(operationFile, "utf8")));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  operation = {
    accountId,
    databaseId,
    databaseName,
    newInstanceId: randomUUID(),
    token: randomBytes(32).toString("hex"),
    completed: false,
  };
  await writeFile(operationFile, `${JSON.stringify(operation, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}
if (operation.accountId !== accountId || operation.databaseId !== databaseId || operation.databaseName !== databaseName)
  throw new Error(
    "The saved operation targets another account/database. Select the original configuration or a new operation file.",
  );
const workerName = `oc-instance-reset-${operation.newInstanceId.replaceAll("-", "")}`;
const workDir = resolve(".tmp", workerName);
await mkdir(workDir, { recursive: true, mode: 0o700 });
const workerConfig = join(workDir, "wrangler.json");
await writeFile(
  workerConfig,
  JSON.stringify({
    name: workerName,
    account_id: accountId,
    main: fileURLToPath(new URL("../src/server/cloudflare/instance-maintenance-worker.ts", import.meta.url)),
    compatibility_date: config.compatibility_date || "2026-07-02",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    vars: { TARGET_DATABASE_ID: databaseId },
    d1_databases: [{ binding: "DB", database_id: databaseId, database_name: databaseName }],
  }),
  { mode: 0o600 },
);

let deployed = false;
try {
  const info = z
    .object({ uuid: z.uuid(), name: z.string() })
    .parse(JSON.parse(await wrangler(["d1", "info", "DB", "--json"])));
  if (info.uuid !== databaseId || info.name !== databaseName)
    throw new Error("Cloudflare database identity does not match the selected DB binding.");
  console.log(`Target: account ${accountId}, DB ${databaseName} (${databaseId}). Operation: ${operationFile}`);
  deployed = true;
  const output = await wrangler(["deploy"]);
  const workerUrl = output.match(new RegExp(`https://${workerName}\\.[a-zA-Z0-9-]+\\.workers\\.dev`))?.[0];
  if (!workerUrl)
    throw new Error("Could not determine the temporary Worker URL. The saved operation is retained for retry.");
  await wrangler(["secret", "put", "MAINTENANCE_TOKEN"], operation.token);
  const snapshot = snapshotSchema.parse(await callWorker(workerUrl, `/inspect?databaseId=${databaseId}`));
  if (snapshot.databaseId !== databaseId) throw new Error("Maintenance Worker reported the wrong database.");
  console.log(`Current identity and affected records: ${JSON.stringify(snapshot)}`);
  if (!operation.snapshot) {
    operation.snapshot = snapshot;
    await saveOperation();
  }
  if (snapshot.instanceId !== operation.snapshot.instanceId && snapshot.instanceId !== operation.newInstanceId)
    throw new Error("Instance identity conflicts with the saved operation. No reset was sent.");
  if (!values.yes) {
    console.log(
      "Inspection only. Stop all HTTP writers, cron triggers and queue consumers, then rerun with --yes and the same operation file.",
    );
  } else {
    console.log(
      `Resetting ${operation.snapshot.instanceId} to ${operation.newInstanceId}; local connections and Marketplace are retained. No SaaS calls will be made.`,
    );
    const result = z
      .object({ databaseId: z.uuid(), instanceId: z.uuid(), result: z.enum(["reset", "already_reset"]) })
      .parse(
        await callWorker(workerUrl, "/reset-instance", {
          databaseId,
          expectedInstanceId: operation.snapshot.instanceId,
          newInstanceId: operation.newInstanceId,
        }),
      );
    if (result.databaseId !== databaseId || result.instanceId !== operation.newInstanceId)
      throw new Error("Reset result identity does not match. Retry the same saved operation.");
    const verified = snapshotSchema.parse(await callWorker(workerUrl, `/inspect?databaseId=${databaseId}`));
    if (
      verified.databaseId !== databaseId ||
      verified.instanceId !== operation.newInstanceId ||
      verified.connections ||
      verified.requests ||
      verified.sources ||
      verified.projects ||
      verified.cleanup
    )
      throw new Error(
        "Post-reset verification failed. Keep writers stopped and inspect the database; do not start a new reset operation.",
      );
    operation.completed = true;
    await saveOperation();
    console.log(`Verified ${result.result}: ${JSON.stringify(verified)}. Preserve the existing encryption key.`);
  }
} finally {
  if (deployed) {
    try {
      await wrangler(["delete", "--force"]);
      console.log(`Removed temporary Worker ${workerName} and its maintenance secret.`);
      await rm(workDir, { recursive: true, force: true });
    } catch {
      console.error(
        `Temporary Worker cleanup failed. Keep the operation file and remove ${workerName} in account ${accountId} before restoring service. Config: ${workerConfig}`,
      );
      process.exitCode = 1;
    }
  } else await rm(workDir, { recursive: true, force: true });
}

async function saveOperation(): Promise<void> {
  const temporary = `${operationFile}.tmp`;
  await writeFile(temporary, `${JSON.stringify(operation, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, operationFile);
}

async function callWorker(origin: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${origin}${path}`, {
    method: body ? "POST" : "GET",
    redirect: "error",
    headers: { authorization: `Bearer ${operation.token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Maintenance request failed with HTTP ${response.status}; retry using the same operation file.`);
  return response.json();
}

async function wrangler(args: string[], input?: string): Promise<string> {
  const cli = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args, "--config", workerConfig], {
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, WRANGLER_SEND_METRICS: "false" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolvePromise(output)
        : reject(
            new Error(
              `Wrangler ${args[0]} failed with exit ${code}; inspect Cloudflare deployment permissions and the target configuration.`,
            ),
          ),
    );
    child.stdin.end(input);
  });
}
