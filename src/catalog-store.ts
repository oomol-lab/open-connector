import type { ActionDefinition, AuthType, ProviderDefinition, ProviderScenario } from "./core/types.ts";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readCatalogIndex } from "./catalog-index.ts";
import { indexedProvidersWithLazySchemas, readProvidersWithLazySchemas } from "./catalog-lazy-schemas.ts";
import { sortProviders } from "./core/catalog.ts";
import { resolveProviderScenario } from "./core/provider-scenarios.ts";

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
  actions: RuntimeActionDefinition[];
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
type ActionSummaryDefinition = Omit<RuntimeActionDefinition, "inputSchema" | "outputSchema">;

/** One provider as `/api/providers` serves it to list views: metadata plus schema-free actions. */
export type ProviderSummaryDefinition = Omit<RuntimeProviderDefinition, "actions"> & {
  actions: ActionSummaryDefinition[];
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
  actions: RuntimeActionDefinition[];
  actionsById: Map<string, RuntimeActionDefinition>;
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
  const sortedProviders = sortProviders(providers);
  const executableActions = new Set(options.executableActionIds ?? []);
  const runtimeProviders = sortedProviders.map((provider): RuntimeProviderDefinition => {
    const actions = provider.actions.map((action): RuntimeActionDefinition => {
      // A descriptor copy instead of a spread: a lazily loaded action exposes its schemas as
      // accessors, and spreading would read them all back into memory here. Plain JSON actions copy
      // to the same keys, in the same order, with the same attributes.
      const runtimeAction = Object.defineProperties(
        {},
        Object.getOwnPropertyDescriptors(action),
      ) as RuntimeActionDefinition;
      runtimeAction.execution = createActionExecutionStatus(provider, action, executableActions);
      return runtimeAction;
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

  return {
    providers: runtimeProviders,
    // TextEncoder rather than Buffer: the Cloudflare Workers build shares this function.
    providerSummariesJson: new TextEncoder().encode(providerSummariesJson),
    providerSummariesEtag: weakEtag(providerSummariesJson),
    actions,
    actionsById: new Map(actions.map((action) => [action.id, action])),
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
    actions: provider.actions.map(toActionSummary),
  };
}

/**
 * Drop the two schema keys by copying the others in order.
 *
 * Rest destructuring or a spread would read both schemas, which pulls every file-backed schema of a
 * lazily loaded catalog into memory while the summaries are built.
 */
function toActionSummary(action: RuntimeActionDefinition): ActionSummaryDefinition {
  const summary: Record<string, unknown> = {};
  for (const key of Object.keys(action) as (keyof RuntimeActionDefinition)[]) {
    if (key === "inputSchema" || key === "outputSchema") {
      continue;
    }
    summary[key] = action[key];
  }

  return summary as ActionSummaryDefinition;
}

/**
 * Load generated provider catalog files from disk.
 *
 * With `lazySchemas`, files are read one at a time and each action keeps only its metadata; the
 * schemas stay on disk behind accessors backed by a small per-file cache, which trades a
 * synchronous read on schema access for a much smaller resident catalog. With `lazySchemaIndexFile`
 * as well, the metadata comes from that one index file and no provider file is read at startup.
 */
export async function loadCatalog(catalogDir: string, options: LoadCatalogOptions = {}): Promise<CatalogStore> {
  const entries = await readdir(catalogDir, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
  const filePaths = fileNames.map((name) => join(catalogDir, name));
  const providers = options.lazySchemas
    ? options.lazySchemaIndexFile
      ? indexedProvidersWithLazySchemas(
          await readCatalogIndex({ indexFile: options.lazySchemaIndexFile, catalogDir, fileNames }),
          options.lazySchemaCacheFiles,
        )
      : await readProvidersWithLazySchemas(filePaths, options.lazySchemaCacheFiles)
    : await Promise.all(
        filePaths.map(async (filePath) => JSON.parse(await readFile(filePath, "utf8")) as ProviderDefinition),
      );
  return createCatalogStore(providers, {
    executableActionIds: resolveExecutableActionIds(providers, options),
  });
}

/** Resolve provider-level executable services into the exact action ids present in a loaded catalog. */
export function resolveExecutableActionIds(
  providers: ProviderDefinition[],
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
  provider: ProviderDefinition,
  action: ActionDefinition,
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
