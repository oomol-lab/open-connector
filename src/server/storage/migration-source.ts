import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where runtime migrations come from. Validation and execution must read the same source so that
 * a migration cannot be required by one and invisible to the other.
 */
export interface MigrationSource {
  /** Migrations for one dialect, sorted by file name. Synchronous because SqliteRuntimeDatabase migrates inside its constructor. */
  readMigrations(dialect: "sqlite" | "postgresql"): { name: string; sql: string }[];
}

/**
 * Directory layout: <directory>/*.sql = sqlite, <directory>/postgresql/*.sql = postgresql.
 * Construction performs no filesystem access; errors (ENOENT etc.) surface from readMigrations().
 * Accepts a directory path string only (no URL): a file: URL base without a trailing slash silently resolves against the
 * parent directory; not accepting URLs removes the trap by construction.
 */
export function createDirectoryMigrationSource(directory: string): MigrationSource {
  return {
    readMigrations(dialect) {
      const dir = dialect === "sqlite" ? directory : join(directory, "postgresql");
      return readdirSync(dir)
        .filter((name) => /^\d+_.*\.sql$/.test(name))
        .sort()
        .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
    },
  };
}

/** The repository's migrations/ directory resolved relative to this module. Used by every Node (non-binary) entry point. */
export const defaultMigrationSource: MigrationSource = createDirectoryMigrationSource(
  fileURLToPath(new URL("../../../migrations/", import.meta.url)),
);
