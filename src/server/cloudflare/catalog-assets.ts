import type { CatalogStore, LoadCatalogOptions } from "../../catalog-store.ts";
import type { ProviderDefinition } from "../../core/types.ts";
import type { AssetsBinding } from "./cloudflare-bindings.ts";

import { createCatalogStore, resolveExecutableActionIds } from "../../catalog-store.ts";

const catalogIndexPath = "/catalog/index.json";
const legacyCatalogPath = "/catalog/apps.json";
const chunkNamePattern = /^apps-\d{4}\.json$/;

interface CatalogAssetIndex {
  version: 1;
  providerCount: number;
  chunks: string[];
}

export async function loadCatalogFromAssets(
  assets: AssetsBinding,
  options: LoadCatalogOptions = {},
): Promise<CatalogStore> {
  const indexResponse = await fetchAsset(assets, catalogIndexPath);
  if (indexResponse.status === 404) {
    const providers = requireProviderArray(await readJsonAsset(assets, legacyCatalogPath), legacyCatalogPath);
    return createCatalogStore(providers, {
      executableActionIds: resolveExecutableActionIds(providers, options),
    });
  }
  if (!indexResponse.ok) {
    throw assetRequestError(catalogIndexPath, indexResponse.status);
  }

  const index = parseCatalogIndex(await readResponseJson(indexResponse, catalogIndexPath));
  const chunks = await Promise.all(
    index.chunks.map(async (chunk) => {
      const path = `/catalog/${chunk}`;
      return requireProviderArray(await readJsonAsset(assets, path), path);
    }),
  );
  const providers = chunks.flat();
  if (providers.length !== index.providerCount) {
    throw new Error(
      `Cloudflare asset catalog provider count mismatch: index declares ${index.providerCount}, loaded ${providers.length}`,
    );
  }

  return createCatalogStore(providers, {
    executableActionIds: resolveExecutableActionIds(providers, options),
  });
}

function parseCatalogIndex(value: unknown): CatalogAssetIndex {
  if (!isRecord(value)) {
    throw new Error("Cloudflare asset catalog index must be an object");
  }
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "chunks,providerCount,version") {
    throw new Error("Cloudflare asset catalog index must contain only version, providerCount, and chunks");
  }
  if (value.version !== 1) {
    throw new Error(`Unsupported Cloudflare asset catalog index version: ${String(value.version)}`);
  }
  if (
    typeof value.providerCount !== "number" ||
    !Number.isSafeInteger(value.providerCount) ||
    value.providerCount < 0
  ) {
    throw new Error("Cloudflare asset catalog index providerCount must be a non-negative safe integer");
  }
  if (!Array.isArray(value.chunks) || !value.chunks.every((chunk): chunk is string => typeof chunk === "string")) {
    throw new Error("Cloudflare asset catalog index chunks must be an array of strings");
  }
  if (!value.chunks.every((chunk) => chunkNamePattern.test(chunk))) {
    throw new Error("Cloudflare asset catalog index contains an invalid chunk name");
  }
  if (new Set(value.chunks).size !== value.chunks.length) {
    throw new Error("Cloudflare asset catalog index contains duplicate chunks");
  }

  return {
    version: 1,
    providerCount: value.providerCount,
    chunks: value.chunks,
  };
}

function requireProviderArray(value: unknown, path: string): ProviderDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error(`Cloudflare asset catalog must be an array: ${path}`);
  }
  return value as ProviderDefinition[];
}

async function readJsonAsset(assets: AssetsBinding, path: string): Promise<unknown> {
  const response = await fetchAsset(assets, path);
  if (!response.ok) {
    throw assetRequestError(path, response.status);
  }
  return readResponseJson(response, path);
}

function fetchAsset(assets: AssetsBinding, path: string): Promise<Response> {
  // Avoid treating a missing JSON asset as an SPA navigation that returns index.html.
  return assets.fetch(
    new Request(new URL(path, "https://assets.local"), {
      headers: { accept: "application/json" },
    }),
  );
}

async function readResponseJson(response: Response, path: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`Cloudflare asset catalog contains invalid JSON: ${path}`);
  }
}

function assetRequestError(path: string, status: number): Error {
  return new Error(`Cloudflare asset catalog request failed: ${path} returned ${status}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
