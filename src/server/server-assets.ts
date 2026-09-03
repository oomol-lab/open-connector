import type { MigrationSource } from "./storage/migration-source.ts";

import { access } from "node:fs/promises";
import { join } from "node:path";
import { createDirectoryMigrationSource, defaultMigrationSource } from "./storage/migration-source.ts";

/**
 * Locations of the assets that are generated or built outside `src` and read
 * by the server at startup.
 */
export interface ServerAssets {
  /** Directory of generated provider catalog JSON files. */
  catalogDir: string;
  migrations: MigrationSource;
  /** Built web console directory, or undefined when the console is not built (index.html missing). */
  staticRoot: string | undefined;
  /**
   * True when the directories above live in the read-only tree embedded in a
   * Bun standalone executable. Embedded files cannot be streamed and report
   * epoch mtimes.
   */
  embedded: boolean;
}

/**
 * Resolve where catalog, migrations and web console live for this process: the
 * embedded tree in a standalone executable, otherwise the working directory and
 * repository layout used by `npm start`.
 *
 * The build script embeds `migrations/`, `catalog/apps/` and `dist/web/` next
 * to the bundled entry point, so inside the executable they appear under
 * `import.meta.dirname` as `migrations/`, `apps/` and `web/`.
 */
export async function resolveServerAssets(): Promise<ServerAssets> {
  if (isStandaloneExecutable()) {
    const root = import.meta.dirname;
    return {
      catalogDir: join(root, "apps"),
      migrations: createDirectoryMigrationSource(join(root, "migrations")),
      staticRoot: await resolveStaticRoot(join(root, "web")),
      embedded: true,
    };
  }

  const cwd = process.cwd();
  return {
    catalogDir: join(cwd, "catalog/apps"),
    migrations: defaultMigrationSource,
    staticRoot: await resolveStaticRoot(join(cwd, "dist/web")),
    embedded: false,
  };
}

/** Only Bun defines the `Bun` global; Node and workerd never do, so the read is safe everywhere. */
function isStandaloneExecutable(): boolean {
  return (globalThis as { Bun?: { isStandaloneExecutable?: boolean } }).Bun?.isStandaloneExecutable === true;
}

async function resolveStaticRoot(root: string): Promise<string | undefined> {
  try {
    await access(join(root, "index.html"));
    return root;
  } catch {
    return undefined;
  }
}
