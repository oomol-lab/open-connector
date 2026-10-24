import type { ProviderAuthSetup } from "./core/provider-setup.ts";
import type { ActionDefinition, AuthType, ProviderDefinition, ProviderScenario } from "./core/types.ts";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readCatalogIndex } from "./catalog-index.ts";
import { loadFileCatalog } from "./catalog-lazy-schemas.ts";
import { sortProviders } from "./core/catalog.ts";
import { resolveProviderScenario } from "./core/provider-scenarios.ts";
import { describeProviderAuth } from "./core/provider-setup.ts";

export type ActionExecutionStatus = {
  locallyExecutable: boolean;
  catalogOnly: boolean;
  requiredAuthTypes: AuthType[];
  noAuthRunnable: boolean;
  needsCredential: boolean;
};

export type RuntimeActionDefinition = ActionDefinition & {
  execution: ActionExecutionStatus;
};

export type RuntimeProviderDefinition = Omit<ProviderDefinition, "actions"> & {
  actions: RuntimeActionSummary[];
  /** Stable task-oriented category supplied to local catalog clients. */
  scenario: ProviderScenario;
  execution: {
    actionCount: number;
    locallyExecutableActionCount: number;
    catalogOnlyActionCount: number;
  };
};

/**
 * Action without its JSON schemas.
 *
 * `inputSchema`/`outputSchema` are ~85% of the serialized catalog but are only
 * needed by the single action detail view, which fetches the full action from
 * `/api/actions/:actionId`. List views read metadata only.
 */
export type RuntimeActionSummary = Omit<RuntimeActionDefinition, "inputSchema" | "outputSchema">;
export type CatalogProviderMetadata = Omit<ProviderDefinition, "actions"> & {
  actions: readonly Omit<ActionDefinition, "inputSchema" | "outputSchema">[];
};

/** One provider as `/api/providers` serves it to list views: metadata plus schema-free actions. */
export type ProviderSummaryDefinition = Omit<RuntimeProviderDefinition, "actions"> & {
  actions: RuntimeActionSummary[];
  /** Host form metadata derived from the same provider definitions. */
  setup: ProviderAuthSetup[];
};

/**
 * In-memory view of generated catalog JSON.
 *
 * `actionsById` is built at load time so request handlers do not repeatedly
 * scan every provider.
 */
export type CatalogStore = {
  providers: RuntimeProviderDefinition[];
  /**
   * Schema-free view of `providers`, serialized once as UTF-8 bytes because the
   * catalog is immutable at runtime. Served verbatim by `/api/providers` so the
   * dashboard does not download every action schema on load, and so the
   * response is neither re-serialized per request nor able to drift from
   * {@link providerSummariesEtag}. Bytes rather than a string: the catalog
   * contains code points above U+00FF, which makes the engine keep a JS string
   * of it as UTF-16 at twice the size.
   */
  providerSummariesJson: Uint8Array<ArrayBuffer>;
  /**
   * Stable ETag for `providerSummariesJson`, computed from the JSON string
   * before it is encoded so it stays what earlier releases sent. The catalog is
   * immutable at runtime, so this is computed once and lets `/api/providers`
   * answer conditional requests with `304 Not Modified`.
   */
  providerSummariesEtag: string;
  actions: RuntimeActionSummary[];
  actionsById: Map<string, RuntimeActionSummary>;
  getAction(id: string): Promise<RuntimeActionDefinition | undefined>;
  executableActionIds: Set<string>;
};

export interface CreateCatalogStoreOptions {
  executableActionIds?: Iterable<string>;
}

/** Which actions of a catalog the runtime may execute locally, independent of where the catalog is read from. */
export interface ExecutableActionOptions extends CreateCatalogStoreOptions {
  /** Mark every catalog action owned by these locally loaded provider services as executable. */
  executableServices?: Iterable<string>;
}

export interface LoadCatalogOptions extends ExecutableActionOptions {
  /** Keep action schemas on disk and read them back on demand (see `OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS`). */
  lazySchemas?: boolean;
  /**
   * Provider files whose schemas stay cached at once in lazy mode. Must be a positive integer. Defaults to
   * `defaultLazySchemaCacheFiles` from `catalog-lazy-schemas.ts`, which the server reads from
   * `OOMOL_CONNECT_CATALOG_SCHEMA_CACHE_FILES`.
   */
  lazySchemaCacheFiles?: number;
  /**
   * Startup index written by `npm run generate:catalog` next to the catalog directory
   * (`catalog/apps-index.json`). Given together with `lazySchemas`, startup reads it instead of every
   * provider file; ignored otherwise.
   */
  lazySchemaIndexFile?: string;
}

export function createCatalogStore(
  providers: ProviderDefinition[],
  options: CreateCatalogStoreOptions = {},
): CatalogStore {
  const definitions = new Map(
    providers.flatMap((provider) => provider.actions.map((action) => [action.id, action] as const)),
  );
  const metadata = providers.map((provider) => ({
    ...provider,
    actions: provider.actions.map(({ inputSchema: _input, outputSchema: _output, ...action }) => action),
  }));
  return createCatalog(metadata, async (id) => definitions.get(id)!, options);
}

function createCatalog(
  providers: CatalogProviderMetadata[],
  readAction: (id: string) => Promise<ActionDefinition>,
  options: CreateCatalogStoreOptions,
): CatalogStore {
  const sortedProviders = sortProviders(providers);
  const executableActions = new Set(options.executableActionIds ?? []);
  const runtimeProviders = sortedProviders.map((provider): RuntimeProviderDefinition => {
    const actions = provider.actions.map((action): RuntimeActionSummary => {
      return { ...action, execution: createActionExecutionStatus(provider, action, executableActions) };
    });

    return {
      ...provider,
      actions,
      scenario: resolveProviderScenario(provider),
      execution: {
        actionCount: actions.length,
        locallyExecutableActionCount: actions.filter((action) => action.execution.locallyExecutable).length,
        catalogOnlyActionCount: actions.filter((action) => action.execution.catalogOnly).length,
      },
    };
  });
  const actions = runtimeProviders.flatMap((provider) => provider.actions);
  const providerSummaries = runtimeProviders.map(toProviderSummary);
  const providerSummariesJson = JSON.stringify(providerSummaries);

  const actionsById = new Map(actions.map((action) => [action.id, action]));
  // Follow the source object's lifetime so the file LRU still controls schema retention.
  const definitions = new WeakMap<ActionDefinition, RuntimeActionDefinition>();
  return {
    providers: runtimeProviders,
    // TextEncoder rather than Buffer: the Cloudflare Workers build shares this function.
    providerSummariesJson: new TextEncoder().encode(providerSummariesJson),
    providerSummariesEtag: weakEtag(providerSummariesJson),
    actions,
    actionsById,
    async getAction(id) {
      const summary = actionsById.get(id);
      if (!summary) return undefined;
      const source = await readAction(id);
      let definition = definitions.get(source);
      if (!definition) {
        definition = { ...source, ...summary };
        definitions.set(source, definition);
      }
      return definition;
    },
    executableActionIds: executableActions,
  };
}

/**
 * Content-derived ETag using a pure-JS FNV-1a hash. Runtime-agnostic (no
 * `node:crypto`, so the Cloudflare Workers build shares this path) and computed
 * once per catalog. Emitted as a weak validator because the response body may
 * be gzip-transformed downstream. It hashes UTF-16 code units and reports the
 * UTF-16 length, so it takes the JSON string rather than the UTF-8 bytes the
 * store keeps; hashing the bytes would change every ETag clients have cached.
 */
function weakEtag(content: string): string {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  const digest = (hash >>> 0).toString(16).padStart(8, "0");
  return `W/"${content.length.toString(16)}-${digest}"`;
}

function toProviderSummary(provider: RuntimeProviderDefinition): ProviderSummaryDefinition {
  return {
    ...provider,
    actions: provider.actions,
    setup: provider.auth.map(describeProviderAuth),
  };
}

/** Load metadata eagerly; schema reads are explicit through getAction. */
export async function loadCatalog(catalogDir: string, options: LoadCatalogOptions = {}): Promise<CatalogStore> {
  const entries = await readdir(catalogDir, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
  const filePaths = fileNames.map((name) => join(catalogDir, name));
  if (options.lazySchemas) {
    const indexed = options.lazySchemaIndexFile
      ? await readCatalogIndex({ indexFile: options.lazySchemaIndexFile, catalogDir, fileNames })
      : undefined;
    const source = await loadFileCatalog(filePaths, indexed, options.lazySchemaCacheFiles);
    return createCatalog(source.providers, source.readAction, {
      executableActionIds: resolveExecutableActionIds(source.providers, options),
    });
  }
  const providers = await readProviderFiles(filePaths);
  return createCatalogStore(providers, { executableActionIds: resolveExecutableActionIds(providers, options) });
}

/** Resolve provider-level executable services into the exact action ids present in a loaded catalog. */
export function resolveExecutableActionIds(
  providers: CatalogProviderMetadata[],
  options: ExecutableActionOptions = {},
): Set<string> {
  const actionIds = new Set(options.executableActionIds ?? []);
  const services = new Set(options.executableServices ?? []);
  for (const provider of providers) {
    if (services.has(provider.service)) {
      for (const action of provider.actions) {
        actionIds.add(action.id);
      }
    }
  }
  return actionIds;
}

function createActionExecutionStatus(
  provider: Pick<ProviderDefinition, "authTypes">,
  action: Pick<ActionDefinition, "id">,
  executableActions: Set<string>,
): ActionExecutionStatus {
  const locallyExecutable = executableActions.has(action.id);
  return {
    locallyExecutable,
    catalogOnly: !locallyExecutable,
    requiredAuthTypes: provider.authTypes,
    noAuthRunnable: provider.authTypes.includes("no_auth"),
    needsCredential: !provider.authTypes.includes("no_auth"),
  };
}

/** Provider files whose reads `readProviderFiles` keeps in flight before it parses them. */
const providerReadBatchSize = 4;

/**
 * Read and parse provider files a few at a time, in directory order.
 *
 * Starting every read at once lets the reads outrun the parses that consume them, so the text of
 * most of the catalog is alive at the same moment, and the allocator keeps that peak resident long
 * after startup. A small batch bounds the unparsed text to a few files while still overlapping
 * enough reads that startup does not wait on one file at a time.
 */
async function readProviderFiles(filePaths: string[]): Promise<ProviderDefinition[]> {
  const providers: ProviderDefinition[] = [];
  for (let start = 0; start < filePaths.length; start += providerReadBatchSize) {
    const batch = filePaths.slice(start, start + providerReadBatchSize);
    providers.push(
      ...(await Promise.all(
        batch.map(async (filePath) => JSON.parse(await readFile(filePath, "utf8")) as ProviderDefinition),
      )),
    );
  }

  return providers;
}
