import type { CatalogStore, LoadCatalogOptions } from "../../catalog-store.ts";
import type { ProviderDefinition } from "../../core/types.ts";
import type { AssetsBinding } from "./cloudflare-bindings.ts";

import { createCatalogStore, resolveExecutableActionIds } from "../../catalog-store.ts";

const catalogAssetPath = "/catalog/apps.json";

export async function loadCatalogFromAssets(
  assets: AssetsBinding,
  options: LoadCatalogOptions = {},
): Promise<CatalogStore> {
  const providers = (await readJsonAsset(assets, catalogAssetPath)) as ProviderDefinition[];
  return createCatalogStore(providers, {
    executableActionIds: resolveExecutableActionIds(providers, options),
  });
}

async function readJsonAsset(assets: AssetsBinding, path: string): Promise<unknown> {
  const response = await assets.fetch(new Request(new URL(path, "https://assets.local")));
  if (!response.ok) {
    throw new Error(`Cloudflare asset catalog request failed: ${path} returned ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}
