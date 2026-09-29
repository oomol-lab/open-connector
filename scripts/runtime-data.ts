import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { logger } from "../src/server/logger.ts";
import { createSecretCodec } from "../src/server/secrets/secret-codec.ts";
import {
  createNodeRuntimeDatabase,
  migratePostgresRuntimeDatabase,
  sqliteMigrationsNotice,
} from "../src/server/storage/node-runtime-database.ts";

const { positionals, values: options } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    "data-dir": { type: "string" },
    plain: { type: "boolean" },
    yes: { type: "boolean" },
  },
  strict: true,
});
const [command] = positionals;

if (
  positionals.length !== 1 ||
  (command !== "migrate" && command !== "reset" && command !== "rotate-key" && command !== "reset-instance")
) {
  printUsageAndExit();
}

const nextEncryptionKey = process.env.OOMOL_CONNECT_NEW_ENCRYPTION_KEY;
if (command === "migrate") {
  if (options.plain || options.yes || options["data-dir"]) {
    throw new Error("migrate does not accept --plain, --yes, or --data-dir.");
  }
} else if (command === "rotate-key") {
  if (options.yes) {
    throw new Error("--yes is only valid with reset or reset-instance.");
  }
  if (!nextEncryptionKey && !options.plain) {
    throw new Error("rotate-key requires OOMOL_CONNECT_NEW_ENCRYPTION_KEY unless --plain is set.");
  }
} else {
  if (options.plain) {
    throw new Error("--plain is only valid with rotate-key.");
  }
  if (!options.yes) {
    throw new Error("reset and reset-instance require --yes; stop all runtime replicas first.");
  }
}

const databaseUrl = process.env.OOMOL_CONNECT_DATABASE_URL?.trim();
const dataDir = resolve(options["data-dir"] ?? process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data"));
const databasePath = join(dataDir, "connect.sqlite");
if (command === "migrate") {
  if (!databaseUrl) {
    console.log(sqliteMigrationsNotice);
  } else {
    await migratePostgresRuntimeDatabase({
      connectionString: databaseUrl,
      connectionTimeoutMs: readPositiveIntegerEnv("OOMOL_CONNECT_DATABASE_CONNECT_TIMEOUT_MS", 10_000),
      logger,
    });
  }
} else {
  const secretCodec = createSecretCodec(process.env.OOMOL_CONNECT_ENCRYPTION_KEY);
  if (!databaseUrl) {
    await mkdir(dataDir, { recursive: true });
  }
  const database = databaseUrl
    ? await createNodeRuntimeDatabase({
        backend: "postgresql",
        connectionString: databaseUrl,
        secretCodec,
        poolMax: readPositiveIntegerEnv("OOMOL_CONNECT_DATABASE_POOL_MAX", 10),
        connectionTimeoutMs: readPositiveIntegerEnv("OOMOL_CONNECT_DATABASE_CONNECT_TIMEOUT_MS", 10_000),
      })
    : await createNodeRuntimeDatabase({
        backend: "sqlite",
        path: databasePath,
        secretCodec,
      });
  const target = databaseUrl ? "the PostgreSQL runtime database" : databasePath;
  try {
    if (command === "rotate-key") {
      await database.rotateSecretCodec(createSecretCodec(options.plain ? undefined : nextEncryptionKey));
      console.log(`Rotated runtime secret encryption in ${target}.`);
    } else if (command === "reset-instance") {
      const snapshot = await database.saasProjectStore.inspectInstance();
      console.log(`Offline instance reset in ${target}: ${JSON.stringify(snapshot)}`);
      const newInstanceId = crypto.randomUUID();
      const result = await database.saasProjectStore.resetInstance({
        expectedInstanceId: snapshot.instanceId,
        newInstanceId,
      });
      if (result === "conflict") throw new Error("Instance identity changed. No reset was applied.");
      console.log(
        `Instance identity changed to ${newInstanceId}. Local connections and Marketplace were retained; no SaaS requests were sent.`,
      );
    } else {
      await database.resetRuntimeData();
      console.log(`Reset runtime data in ${target}.`);
    }
  } finally {
    await database.close();
  }
}

function printUsageAndExit(): never {
  console.error(`Usage:
  node scripts/runtime-data.ts migrate
  node scripts/runtime-data.ts reset --yes [--data-dir ./data]
  node scripts/runtime-data.ts reset-instance --yes [--data-dir ./data]
  node scripts/runtime-data.ts rotate-key [--data-dir ./data]
  node scripts/runtime-data.ts rotate-key --plain [--data-dir ./data]

Stop all runtime replicas before reset, reset-instance, or rotate-key. These commands do not operate on D1.
reset preserves the instance identity; reset-instance removes only SaaS data and changes the identity without contacting SaaS.
Set OOMOL_CONNECT_DATABASE_URL to migrate or maintain a PostgreSQL runtime database.
Set OOMOL_CONNECT_ENCRYPTION_KEY to read/write encrypted runtime credential records.
Set OOMOL_CONNECT_NEW_ENCRYPTION_KEY when rotating to a new encryption key.`);
  process.exit(1);
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
