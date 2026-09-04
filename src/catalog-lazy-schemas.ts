import type { CatalogIndexAction, CatalogIndexProvider, IndexedProvider } from "./catalog-index.ts";
import type { ActionDefinition, JsonSchema, ProviderDefinition } from "./core/types.ts";

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

interface ActionSchemas {
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

/**
 * Non-enumerable link from a metadata-only action back to the catalog file that still owns its
 * schemas. It is a symbol so it never reaches `Object.keys`, `JSON.stringify` or a spread copy,
 * while `Object.getOwnPropertyDescriptors` still carries it onto the runtime action.
 */
const actionSchemaSource = Symbol("catalog action schema source");

interface FileBackedActionDefinition extends ActionDefinition {
  [actionSchemaSource]: FileActionSchemaSource;
}

/** Provider files whose parsed action schemas stay cached at once (`OOMOL_CONNECT_CATALOG_SCHEMA_CACHE_FILES`). */
export const defaultLazySchemaCacheFiles = 64;

/**
 * Read provider catalog files while keeping every `inputSchema`/`outputSchema` on disk.
 *
 * Each action keeps schema-shaped accessors at their original key positions, so a lazily loaded
 * catalog serializes byte-for-byte like an eagerly loaded one, and an accessor reads its schemas
 * back from the file that owns them. Because every parsed provider is reduced to its metadata
 * before the next file is read, peak memory here holds a single fully parsed provider.
 */
export async function readProvidersWithLazySchemas(
  filePaths: string[],
  cacheFiles: number = defaultLazySchemaCacheFiles,
): Promise<ProviderDefinition[]> {
  const loader = new FileActionSchemaLoader(cacheFiles);
  const providers: ProviderDefinition[] = [];
  for (const filePath of filePaths) {
    const provider = JSON.parse(await readFile(filePath, "utf8")) as ProviderDefinition;
    providers.push(toFileBackedProvider(provider, filePath, loader));
  }

  return providers;
}

/**
 * Attach lazy schema accessors to providers read from the catalog index, which already carries every
 * action without its schemas. Nothing is read here: each provider file is opened only when one of its
 * schemas is first accessed.
 */
export function indexedProvidersWithLazySchemas(
  providers: IndexedProvider[],
  cacheFiles: number = defaultLazySchemaCacheFiles,
): ProviderDefinition[] {
  const loader = new FileActionSchemaLoader(cacheFiles);
  return providers.map((entry) => toFileBackedProvider(entry.provider, entry.filePath, loader));
}

function toFileBackedProvider(
  provider: ProviderDefinition | CatalogIndexProvider,
  filePath: string,
  loader: FileActionSchemaLoader,
): ProviderDefinition {
  const source = new FileActionSchemaSource(filePath, loader);
  return {
    ...provider,
    actions: provider.actions.map((action) => toFileBackedAction(action, source)),
  };
}

/**
 * Copy one parsed action without its schemas, replacing them with enumerable accessors defined at
 * the key position they had in the file. Real catalog actions carry `followUpActions` and
 * `asyncLifecycle` after the schemas, so appending the accessors instead would reorder the keys and
 * change every serialized response. An index action holds `null` at those positions, which the copy
 * never reads.
 */
function toFileBackedAction(
  action: ActionDefinition | CatalogIndexAction,
  source: FileActionSchemaSource,
): ActionDefinition {
  const fileBacked: Record<string, unknown> = {};
  for (const key of Object.keys(action)) {
    if (key === "inputSchema" || key === "outputSchema") {
      Object.defineProperty(fileBacked, key, {
        get: key === "inputSchema" ? readInputSchema : readOutputSchema,
        enumerable: true,
        configurable: true,
      });
    } else {
      fileBacked[key] = action[key as keyof ActionDefinition];
    }
  }
  Object.defineProperty(fileBacked, actionSchemaSource, { value: source });

  return fileBacked as ActionDefinition;
}

function readInputSchema(this: FileBackedActionDefinition): JsonSchema {
  return this[actionSchemaSource].read(this.id).inputSchema;
}

function readOutputSchema(this: FileBackedActionDefinition): JsonSchema {
  return this[actionSchemaSource].read(this.id).outputSchema;
}

/** The one catalog file that backs every action loaded from it. */
class FileActionSchemaSource {
  private readonly filePath: string;
  private readonly loader: FileActionSchemaLoader;

  constructor(filePath: string, loader: FileActionSchemaLoader) {
    this.filePath = filePath;
    this.loader = loader;
  }

  read(actionId: string): ActionSchemas {
    return this.loader.read(this.filePath, actionId);
  }
}

/**
 * Least-recently-used cache of parsed catalog files, shared by every action of one loaded catalog.
 *
 * Reads are synchronous because they answer property getters. A miss re-reads the whole file, so an
 * uncached file that changed on disk is picked up on its next access.
 */
class FileActionSchemaLoader {
  private readonly cache = new Map<string, Map<string, ActionSchemas>>();
  private readonly maxCachedFiles: number;

  constructor(maxCachedFiles: number) {
    // A size below 1 would evict every entry as soon as it is inserted, and NaN or Infinity would
    // never evict, turning the bounded cache into one that retains every provider file.
    if (!Number.isInteger(maxCachedFiles) || maxCachedFiles < 1) {
      throw new Error(`lazySchemaCacheFiles must be a positive integer, got ${maxCachedFiles}`);
    }
    this.maxCachedFiles = maxCachedFiles;
  }

  read(filePath: string, actionId: string): ActionSchemas {
    const cached = this.cache.get(filePath);
    // Re-inserting a hit moves it to the end of the insertion order, so the first key is the least
    // recently used file.
    this.cache.delete(filePath);
    const schemas = cached ?? readActionSchemas(filePath);
    this.cache.set(filePath, schemas);
    while (this.cache.size > this.maxCachedFiles) {
      const leastRecent = this.cache.keys().next().value;
      if (leastRecent === undefined) {
        break;
      }
      this.cache.delete(leastRecent);
    }

    const actionSchemas = schemas.get(actionId);
    if (!actionSchemas) {
      throw new Error(`Catalog action ${actionId} is missing from ${filePath}`);
    }
    return actionSchemas;
  }
}

function readActionSchemas(filePath: string): Map<string, ActionSchemas> {
  const provider = JSON.parse(readFileSync(filePath, "utf8")) as ProviderDefinition;
  return new Map(
    provider.actions.map((action) => [
      action.id,
      { inputSchema: action.inputSchema, outputSchema: action.outputSchema },
    ]),
  );
}
