import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createSecretCodec } from "../src/server/secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "../src/server/storage/sqlite-runtime-store.ts";

const command = process.argv[2];
const options = parseOptions(process.argv.slice(3));
const dataDir = resolve(options.dataDir ?? process.env.OOMOL_CONNECT_DATA_DIR ?? join(process.cwd(), "data"));
const databasePath = join(dataDir, "connect.sqlite");
const secretCodec = createSecretCodec(process.env.OOMOL_CONNECT_ENCRYPTION_KEY);

if (!command || !["reset", "rotate-key"].includes(command)) {
  printUsageAndExit();
}

await mkdir(dataDir, { recursive: true });

if (command === "rotate-key") {
  const nextEncryptionKey = process.env.OOMOL_CONNECT_NEW_ENCRYPTION_KEY;
  if (!nextEncryptionKey && options.plain !== "true") {
    throw new Error("rotate-key requires OOMOL_CONNECT_NEW_ENCRYPTION_KEY unless --plain is set.");
  }
  const database = new SqliteRuntimeDatabase(databasePath, { secretCodec });
  try {
    await database.rotateSecretCodec(createSecretCodec(options.plain === "true" ? undefined : nextEncryptionKey));
    console.log(`Rotated runtime secret encryption in ${databasePath}.`);
  } finally {
    database.close();
  }
} else {
  const database = new SqliteRuntimeDatabase(databasePath, { secretCodec });
  try {
    if (options.yes !== "true") {
      throw new Error("reset requires --yes.");
    }
    database.resetRuntimeData();
    console.log(`Reset runtime data in ${databasePath}.`);
  } finally {
    database.close();
  }
}

type RuntimeDataCommandOptions = {
  dataDir?: string;
  plain?: string;
  yes?: string;
};

function parseOptions(args: string[]): RuntimeDataCommandOptions {
  const options: RuntimeDataCommandOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--yes") {
      options.yes = "true";
      continue;
    }
    if (arg === "--plain") {
      options.plain = "true";
      continue;
    }

    const value = args[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value.`);
    }

    if (arg === "--data-dir") {
      options.dataDir = value;
    } else {
      throw new Error(`Unknown option: ${arg}.`);
    }
    index += 1;
  }

  return options;
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
