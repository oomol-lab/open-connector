/** Run with `node scripts/benchmark-sqlite-token-statements.ts`; timings are not CI assertions. */
import type { RuntimeTokenRecord } from "../src/server/storage/runtime-token-service.ts";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { readRuntimeTokenRow, runtimeTokenColumns } from "../src/server/storage/runtime-sql.ts";
import { SqliteRuntimeDatabase, SqliteRuntimeTokenStore } from "../src/server/storage/sqlite/runtime-store.ts";

/** The two store methods before statement reuse, with the same decoding and async boundary. */
class PreparePerCallTokenStore extends SqliteRuntimeTokenStore {
  private readonly connection: DatabaseSync;

  constructor(database: DatabaseSync) {
    super(database, "local");
    this.connection = database;
  }

  override async findByHash(tokenHash: string): Promise<RuntimeTokenRecord | undefined> {
    const row = this.connection
      .prepare(`select tenant_id, ${runtimeTokenColumns} from runtime_tokens where token_hash = ?`)
      .get(tokenHash);
    return row ? readRuntimeTokenRow(row) : undefined;
  }

  override async markUsed(id: string, usedAt: string): Promise<void> {
    this.connection.prepare("update runtime_tokens set last_used_at = ? where id = ?").run(usedAt, id);
  }
}

const tokenCount = 100;
const rounds = 7;
const hashes = Array.from({ length: tokenCount }, (_, index) => `hash-${index}`);
const timestamps = Array.from({ length: 30_000 }, (_, index) => new Date(1_790_726_400_000 + index).toISOString());

async function measure(store: SqliteRuntimeTokenStore, iterations: number): Promise<number> {
  const start = performance.now();
  for (let index = 0; index < iterations; index++) {
    const token = await store.findByHash(hashes[index % tokenCount]);
    if (!token) throw new Error("Benchmark token is missing.");
    await store.markUsed(token.id, timestamps[index]);
  }
  return performance.now() - start;
}

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

async function benchmark(filename: string, iterations: number, schema?: string): Promise<void> {
  const database = new DatabaseSync(filename);
  try {
    if (schema) database.exec(schema);
    // Match the runtime's WAL setting; in-memory SQLite reports "memory" instead.
    database.exec("pragma journal_mode = wal;");
    const baseline = new PreparePerCallTokenStore(database);
    const reused = new SqliteRuntimeTokenStore(database, "local");
    for (let index = 0; index < tokenCount; index++) {
      await reused.add({
        id: `token-${index}`,
        name: `Token ${index}`,
        tenantId: "local",
        tokenHash: hashes[index],
        allowedActions: ["github.*"],
        blockedActions: ["github.delete_repository"],
        allowedProxies: ["github"],
        allowedConnections: ["example:work"],
        createdAt: timestamps[0],
      });
    }
    await measure(baseline, 500);
    await measure(reused, 500);
    const baselineMs: number[] = [];
    const reusedMs: number[] = [];
    for (let round = 0; round < rounds; round++) {
      if (round % 2 === 0) {
        baselineMs.push(await measure(baseline, iterations));
        reusedMs.push(await measure(reused, iterations));
      } else {
        reusedMs.push(await measure(reused, iterations));
        baselineMs.push(await measure(baseline, iterations));
      }
    }
    const before = median(baselineMs);
    const after = median(reusedMs);
    console.log(
      JSON.stringify(
        {
          storage: filename === ":memory:" ? "memory" : "file",
          node: process.version,
          sqlite: database.prepare("select sqlite_version() as version").get()?.version,
          journalMode: database.prepare("pragma journal_mode").get()?.journal_mode,
          synchronous: database.prepare("pragma synchronous").get()?.synchronous,
          tokenCount,
          iterations,
          rounds,
          baselineMs,
          reusedMs,
          baselineMedianMs: before,
          reusedMedianMs: after,
          baselineMicrosecondsPerPair: (before * 1000) / iterations,
          reusedMicrosecondsPerPair: (after * 1000) / iterations,
          speedup: before / after,
        },
        null,
        2,
      ),
    );
  } finally {
    database.close();
  }
}

const directory = await mkdtemp(join(tmpdir(), "sqlite-token-benchmark-"));
try {
  const filename = join(directory, "runtime.sqlite");
  // Apply actual runtime migrations once, outside the measured loops.
  const runtime = new SqliteRuntimeDatabase(filename);
  runtime.close();
  // Copy the migrated empty schema so both modes use the same table and indexes.
  const source = new DatabaseSync(filename);
  const schema = source
    .prepare("select sql from sqlite_master where sql is not null and name not like 'sqlite_%'")
    .all()
    .map((row) => String(row.sql))
    .join(";\n");
  source.close();
  // An in-memory database needs its schema on the same connection as the benchmark.
  await benchmark(":memory:", 30_000, schema);
  await benchmark(filename, 1000);
} finally {
  await rm(directory, { recursive: true, force: true });
}
