import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createSecretCodec } from "../src/server/secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "../src/server/storage/sqlite-runtime-store.ts";

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

if (positionals.length !== 1 || (command !== "reset" && command !== "rotate-key")) {
  printUsageAndExit();
}

const nextEncryptionKey = process.env.OOMOL_CONNECT_NEW_ENCRYPTION_KEY;
if (command === "rotate-key") {
  if (options.yes) {
    throw new Error("--yes is only valid with reset.");
  }
  if (!nextEncryptionKey && !options.plain) {
    throw new Error("rotate-key requires OOMOL_CONNECT_NEW_ENCRYPTION_KEY unless --plain is set.");
  }
} else {
  if (options.plain) {
    throw new Error("--plain is only valid with rotate-key.");
  }
  if (!options.yes) {
    throw new Error("reset requires --yes.");
  }
}

const dataDir = resolve(options["data-dir"] ?? process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data"));
const databasePath = join(dataDir, "connect.sqlite");
const secretCodec = createSecretCodec(process.env.OOMOL_CONNECT_ENCRYPTION_KEY);
await mkdir(dataDir, { recursive: true });

const database = new SqliteRuntimeDatabase(databasePath, { secretCodec });
try {
  if (command === "rotate-key") {
    await database.rotateSecretCodec(createSecretCodec(options.plain ? undefined : nextEncryptionKey));
    console.log(`Rotated runtime secret encryption in ${databasePath}.`);
  } else {
    database.resetRuntimeData();
    console.log(`Reset runtime data in ${databasePath}.`);
  }
} finally {
  database.close();
}

function printUsageAndExit(): never {
  console.error(`Usage:
  node scripts/runtime-data.ts reset --yes [--data-dir ./data]
  node scripts/runtime-data.ts rotate-key [--data-dir ./data]
  node scripts/runtime-data.ts rotate-key --plain [--data-dir ./data]

Set OOMOL_CONNECT_ENCRYPTION_KEY to read/write encrypted local credential records.
Set OOMOL_CONNECT_NEW_ENCRYPTION_KEY when rotating to a new encryption key.`);
  process.exit(1);
}
