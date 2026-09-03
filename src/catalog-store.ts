import type { ActionDefinition, AuthType, ProviderDefinition, ProviderScenario } from "./core/types.ts";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
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
   * Schema-free view of `providers`, pre-serialized once because the catalog is
   * immutable at runtime. Served verbatim by `/api/providers` so the dashboard
   * does not download every action schema on load, and so the response is
   * neither re-serialized per request nor able to drift from
   * {@link providerSummariesEtag}.
   */
  providerSummariesJson: string;
  /**
   * Stable ETag for `providerSummariesJson`. The catalog is immutable at
   * runtime, so this is computed once and lets `/api/providers` answer
   * conditional requests with `304 Not Modified`.
   */
  providerSummariesEtag: string;
  actions: RuntimeActionDefinition[];
  actionsById: Map<string, RuntimeActionDefinition>;
  executableActionIds: Set<string>;
};

export interface CreateCatalogStoreOptions {
  executableActionIds?: Iterable<string>;
}

export interface LoadCatalogOptions extends CreateCatalogStoreOptions {
  /** Mark every catalog action owned by these locally loaded provider services as executable. */
  executableServices?: Iterable<string>;
}

export function createCatalogStore(
  providers: ProviderDefinition[],
  options: CreateCatalogStoreOptions = {},
): CatalogStore {
  const sortedProviders = sortProviders(providers);
  const executableActions = new Set(options.executableActionIds ?? []);
  const runtimeProviders = sortedProviders.map((provider): RuntimeProviderDefinition => {
    const actions = provider.actions.map(
      (action): RuntimeActionDefinition => ({
        ...action,
        execution: createActionExecutionStatus(provider, action, executableActions),
      }),
    );

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
    providerSummariesJson,
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
 * be gzip-transformed downstream.
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
    actions: provider.actions.map(({ inputSchema: _inputSchema, outputSchema: _outputSchema, ...action }) => action),
  };
}

/**
 * Load generated provider catalog files from disk.
 */
export async function loadCatalog(catalogDir: string, options: LoadCatalogOptions = {}): Promise<CatalogStore> {
  const entries = await readdir(catalogDir, { withFileTypes: true });
  const providers = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const content = await readFile(join(catalogDir, entry.name), "utf8");
        return JSON.parse(content) as ProviderDefinition;
      }),
  );
  return createCatalogStore(providers, {
    executableActionIds: resolveExecutableActionIds(providers, options),
  });
}

/** Resolve provider-level executable services into the exact action ids present in a loaded catalog. */
export function resolveExecutableActionIds(
  providers: ProviderDefinition[],
  options: LoadCatalogOptions = {},
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
