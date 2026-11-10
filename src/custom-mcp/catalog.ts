import type { CatalogLocale } from "../catalog-localization/localization.ts";
import type { CatalogStore, RuntimeActionDefinition } from "../catalog-store.ts";
import type { ActionSearchIndexProvider } from "../core/action-search.ts";
import type { CustomMcpStore } from "../server/storage/custom-mcp-store.ts";
import type { CustomMcpRecord } from "./definition.ts";

import { AsyncLocalStorage } from "node:async_hooks";
import { createCatalogFromMetadata } from "../catalog-store.ts";
import { createActionSearchIndexProvider } from "../core/action-search.ts";
import { customMcpProvider } from "./definition.ts";

interface CatalogSnapshot {
  version: string;
  records: Map<string, CustomMcpRecord>;
  catalog: CatalogStore;
  search: ActionSearchIndexProvider;
}

/** Combines generated definitions with database providers, keeping a stable view within each request. */
export class CustomMcpCatalog implements CatalogStore {
  private readonly base: CatalogStore;
  private readonly store: CustomMcpStore;
  private readonly scope = new AsyncLocalStorage<CatalogSnapshot>();
  private snapshot: CatalogSnapshot;

  constructor(base: CatalogStore, store: CustomMcpStore) {
    this.base = base;
    this.store = store;
    this.snapshot = {
      version: "",
      records: new Map(),
      catalog: base,
      search: createActionSearchIndexProvider(base.actions),
    };
  }

  private get current(): CatalogSnapshot {
    return this.scope.getStore() ?? this.snapshot;
  }
  get providers(): CatalogStore["providers"] {
    return this.current.catalog.providers;
  }
  get actions(): CatalogStore["actions"] {
    return this.current.catalog.actions;
  }
  get actionsById(): CatalogStore["actionsById"] {
    return this.current.catalog.actionsById;
  }
  get executableActionIds(): CatalogStore["executableActionIds"] {
    return this.current.catalog.executableActionIds;
  }
  get providerSummariesJson(): CatalogStore["providerSummariesJson"] {
    return this.current.catalog.providerSummariesJson;
  }
  get providerSummariesEtag(): CatalogStore["providerSummariesEtag"] {
    return this.current.catalog.providerSummariesEtag;
  }
  getProviderDisplay(locale: CatalogLocale): ReturnType<CatalogStore["getProviderDisplay"]> {
    return this.current.catalog.getProviderDisplay(locale);
  }
  getAction(id: string): Promise<RuntimeActionDefinition | undefined> {
    return this.current.catalog.getAction(id);
  }
  getRecord(service: string): CustomMcpRecord | undefined {
    return this.current.records.get(service);
  }
  listRecords(): CustomMcpRecord[] {
    return [...this.current.records.values()];
  }
  getSearchIndex(): ReturnType<ActionSearchIndexProvider["get"]> {
    return this.current.search.get();
  }

  async withSnapshot<T>(run: () => Promise<T>): Promise<T> {
    const snapshot = await this.refresh();
    return this.scope.run(snapshot, run);
  }

  async refresh(): Promise<CatalogSnapshot> {
    const version = await this.store.version();
    if (version === this.snapshot.version) return this.snapshot;
    const records = await this.store.list();
    const definitions = records.map(customMcpProvider);
    const actions = new Map(definitions.flatMap((provider) => provider.actions.map((action) => [action.id, action])));
    let catalog = this.base;
    if (records.length > 0) {
      const metadata = definitions.map((provider) => ({
        ...provider,
        actions: provider.actions.map(({ inputSchema: _input, outputSchema: _output, ...action }) => action),
      }));
      catalog = createCatalogFromMetadata(
        [...this.base.providers, ...metadata],
        async (id) => actions.get(id) ?? (await this.base.getAction(id))!,
        { executableActionIds: [...this.base.executableActionIds, ...actions.keys()] },
      );
    }
    this.snapshot = {
      version: JSON.stringify(records.map((record) => [record.service, record.revision])),
      records: new Map(records.map((record) => [record.service, record])),
      catalog,
      search: createActionSearchIndexProvider(catalog.actions),
    };
    return this.snapshot;
  }
}
