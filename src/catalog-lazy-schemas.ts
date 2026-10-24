import type { IndexedProvider } from "./catalog-index.ts";
import type { CatalogProviderMetadata } from "./catalog-store.ts";
import type { ActionDefinition, ProviderDefinition } from "./core/types.ts";

import { readFile } from "node:fs/promises";

export const defaultLazySchemaCacheFiles = 64;

interface FileCatalog {
  providers: CatalogProviderMetadata[];
  readAction(id: string): Promise<ActionDefinition>;
}

/** Metadata has no accessors; only readAction performs file I/O. Failed reads are retryable. */
export async function loadFileCatalog(
  filePaths: string[],
  indexed?: IndexedProvider[],
  cacheFiles: number = defaultLazySchemaCacheFiles,
): Promise<FileCatalog> {
  if (!Number.isInteger(cacheFiles) || cacheFiles < 1) {
    throw new Error(`lazySchemaCacheFiles must be a positive integer, got ${cacheFiles}`);
  }
  const providers: CatalogProviderMetadata[] = [];
  const paths = new Map<string, string>();
  const addProvider = (provider: ProviderDefinition | IndexedProvider["provider"], filePath: string): void => {
    providers.push({
      ...provider,
      actions: provider.actions.map(({ inputSchema: _input, outputSchema: _output, ...action }) => {
        paths.set(action.id, filePath);
        return action;
      }),
    });
  };
  if (indexed) {
    for (const entry of indexed) addProvider(entry.provider, entry.filePath);
  } else {
    for (const filePath of filePaths)
      addProvider(JSON.parse(await readFile(filePath, "utf8")) as ProviderDefinition, filePath);
  }
  const cache = new Map<string, Promise<Map<string, ActionDefinition>>>();
  return {
    providers,
    async readAction(id) {
      const filePath = paths.get(id)!;
      let pending = cache.get(filePath);
      cache.delete(filePath);
      if (!pending) {
        pending = readFile(filePath, "utf8").then((text) => {
          const provider = JSON.parse(text) as ProviderDefinition;
          return new Map(provider.actions.map((action) => [action.id, action]));
        });
        const read = pending;
        void pending.catch(() => {
          if (cache.get(filePath) === read) cache.delete(filePath);
        });
      }
      cache.set(filePath, pending);
      while (cache.size > cacheFiles) cache.delete(cache.keys().next().value!);
      const action = (await pending).get(id);
      if (!action) throw new Error(`Catalog action ${id} is missing from ${filePath}`);
      return action;
    },
  };
}
