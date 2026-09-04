import type { ActionDefinition, ProviderDefinition } from "./core/types.ts";

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Startup index of the generated catalog: every provider file without its action schemas.
 *
 * `npm run generate:catalog` writes it next to `catalog/apps/` as `catalog/apps-index.json`, and the
 * single-file executable embeds it beside `apps/`. With `OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS` the
 * server reads this one file at startup instead of every provider file; the schemas are still read
 * from the provider files on access. Default mode never reads it.
 */
export interface CatalogIndex {
  version: 1;
  providers: CatalogIndexEntry[];
}

/** Name of the index file inside the catalog directory that holds `apps/`. */
export const catalogIndexFileName = "apps-index.json";

/**
 * An action as the index stores it: every key at the position it has in the provider file, with the
 * two schema keys holding `null`. The lazy loader defines its accessors at the key position it finds,
 * and real actions carry `followUpActions` and `asyncLifecycle` after the schemas, so dropping the
 * keys instead would reorder every serialized action.
 */
export type CatalogIndexAction = Omit<ActionDefinition, "inputSchema" | "outputSchema"> & {
  inputSchema: null;
  outputSchema: null;
};

/** A provider as the index stores it: file key order, schema-free actions. */
export type CatalogIndexProvider = Omit<ProviderDefinition, "actions"> & {
  actions: CatalogIndexAction[];
};

export interface CatalogIndexEntry {
  /** Basename of the provider file under the catalog directory, which still owns the action schemas. */
  file: string;
  /**
   * UTF-8 length of that file as the generator wrote it. Compared with the directory at load time so
   * an index left beside a regenerated or hand-edited catalog is refused instead of served.
   */
  bytes: number;
  provider: CatalogIndexProvider;
}

/** One provider file as the generator wrote it. */
export interface CatalogIndexSource {
  file: string;
  bytes: number;
  provider: ProviderDefinition;
}

/** A provider read from the index together with the file its schemas are read from. */
export interface IndexedProvider {
  filePath: string;
  provider: CatalogIndexProvider;
}

export interface ReadCatalogIndexOptions {
  indexFile: string;
  /** Directory of provider files the index must describe. */
  catalogDir: string;
  /** The `.json` entries of `catalogDir`. */
  fileNames: string[];
}

/** Build the index the generator writes; `sources` must be in catalog order. */
export function createCatalogIndex(sources: CatalogIndexSource[]): CatalogIndex {
  return {
    version: 1,
    providers: sources.map((source) => ({
      file: source.file,
      bytes: source.bytes,
      provider: {
        ...source.provider,
        actions: source.provider.actions.map(withoutSchemas),
      },
    })),
  };
}

function withoutSchemas(action: ActionDefinition): CatalogIndexAction {
  const indexed: Record<string, unknown> = {};
  for (const key of Object.keys(action)) {
    indexed[key] = key === "inputSchema" || key === "outputSchema" ? null : action[key as keyof ActionDefinition];
  }

  return indexed as CatalogIndexAction;
}

const regenerate = "run npm run generate:catalog";

/**
 * Read the index and check it against the provider files actually present in the catalog directory.
 *
 * The index must list exactly the given files with the byte lengths they have now; anything else means
 * the two were not written by the same `npm run generate:catalog` run, and serving one generation's
 * metadata with another's schemas would produce responses no generation ever had.
 */
export async function readCatalogIndex(options: ReadCatalogIndexOptions): Promise<IndexedProvider[]> {
  const { indexFile, catalogDir, fileNames } = options;
  const content = await readFile(indexFile, "utf8");
  let index: unknown;
  try {
    index = JSON.parse(content);
  } catch (error) {
    throw new Error(`Catalog index ${indexFile} is not valid JSON; ${regenerate}`, { cause: error });
  }
  if (!isCatalogIndex(index)) {
    throw new Error(`Catalog index ${indexFile} is not a version 1 index; ${regenerate}`);
  }

  const indexedFiles = new Set(index.providers.map((entry) => entry.file));
  const unindexed = fileNames.filter((name) => !indexedFiles.has(name));
  const present = new Set(fileNames);
  const removed = index.providers.filter((entry) => !present.has(entry.file)).map((entry) => entry.file);
  if (unindexed.length > 0 || removed.length > 0 || indexedFiles.size !== index.providers.length) {
    throw new Error(
      `Catalog index ${indexFile} does not describe ${catalogDir} (not indexed: ${describeNames(unindexed)}; no longer present: ${describeNames(removed)}); ${regenerate}`,
    );
  }

  const providers: IndexedProvider[] = [];
  for (const entry of index.providers) {
    const filePath = join(catalogDir, entry.file);
    const { size } = await stat(filePath);
    if (size !== entry.bytes) {
      throw new Error(
        `Catalog index ${indexFile} was written for a different ${entry.file} (${entry.bytes} bytes, now ${size}); ${regenerate}`,
      );
    }
    providers.push({ filePath, provider: entry.provider });
  }

  return providers;
}

function isCatalogIndex(value: unknown): value is CatalogIndex {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { version, providers } = value as Partial<CatalogIndex>;
  return (
    version === 1 &&
    Array.isArray(providers) &&
    providers.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.file === "string" &&
        Number.isInteger(entry.bytes) &&
        typeof entry.provider === "object" &&
        entry.provider !== null,
    )
  );
}

function describeNames(names: string[]): string {
  if (names.length === 0) {
    return "none";
  }
  const shown = names.slice(0, 5).join(", ");
  return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown;
}
