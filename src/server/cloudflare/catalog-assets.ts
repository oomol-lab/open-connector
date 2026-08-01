import type { CatalogStore, LoadCatalogOptions } from "../../catalog-store.ts";
import type { ProviderDefinition } from "../../core/types.ts";
import type { AssetsBinding } from "./cloudflare-bindings.ts";

import { createCatalogStore, resolveExecutableActionIds } from "../../catalog-store.ts";

const catalogIndexPath = "/catalog/index.json";
const legacyCatalogPath = "/catalog/apps.json";
const chunkNamePattern = /^apps-\d{4}\.json$/;
const jsonContentTypePattern = /^application\/(?:[\w.+-]+\+)?json$/i;

interface CatalogAssetIndex {
  version: 1;
  providerCount: number;
  chunks: string[];
}

/** A catalog asset read attempt: either the parsed JSON, or why the asset is treated as absent. */
type CatalogAsset = { found: true; value: unknown } | { found: false; reason: string };

export async function loadCatalogFromAssets(
  assets: AssetsBinding,
  options: LoadCatalogOptions = {},
): Promise<CatalogStore> {
  const indexAsset = await readJsonAsset(assets, catalogIndexPath);
  if (!indexAsset.found) {
    const legacyAsset = await readJsonAsset(assets, legacyCatalogPath);
    if (!legacyAsset.found) {
      // Naming both paths matters: current builds emit only the index, so an operator seeing just
      // the legacy failure would chase an asset the build stopped producing.
      throw assetRequestError(catalogIndexPath, `${indexAsset.reason}, and ${legacyCatalogPath} ${legacyAsset.reason}`);
    }
    return createCatalog(requireProviderArray(legacyAsset.value, legacyCatalogPath), options);
  }

  const index = parseCatalogIndex(indexAsset.value, catalogIndexPath);
  const chunks = await Promise.all(index.chunks.map((chunk) => requireProviderArrayAsset(assets, `/catalog/${chunk}`)));
  const providers = chunks.flat();
  if (providers.length !== index.providerCount) {
    throw new Error(
      `Cloudflare asset catalog provider count mismatch: index declares ${index.providerCount}, loaded ${providers.length}`,
    );
  }

  return createCatalog(providers, options);
}

function createCatalog(providers: ProviderDefinition[], options: LoadCatalogOptions): CatalogStore {
  return createCatalogStore(providers, {
    executableActionIds: resolveExecutableActionIds(providers, options),
  });
}

function parseCatalogIndex(value: unknown, path: string): CatalogAssetIndex {
  if (!isRecord(value)) {
    throw new Error(`Cloudflare asset catalog index must be an object: ${path}`);
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

async function requireProviderArrayAsset(assets: AssetsBinding, path: string): Promise<ProviderDefinition[]> {
  const asset = await readJsonAsset(assets, path);
  if (!asset.found) {
    throw assetRequestError(path, asset.reason);
  }

  return requireProviderArray(asset.value, path);
}

function requireProviderArray(value: unknown, path: string): ProviderDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error(`Cloudflare asset catalog must be an array: ${path}`);
  }

  return value as ProviderDefinition[];
}

/**
 * Read one catalog asset as JSON, reporting absence instead of throwing.
 *
 * `not_found_handling: "single-page-application"` (see `wrangler.example.jsonc`) makes the assets
 * binding answer an unknown path with `index.html` and status 200 rather than 404, and it does so
 * for binding fetches regardless of the request's `Accept` header. Absence is therefore decided by
 * the response content type as well as by the status, so a deployment whose assets predate catalog
 * chunking still resolves to the legacy catalog instead of failing on the SPA shell.
 */
async function readJsonAsset(assets: AssetsBinding, path: string): Promise<CatalogAsset> {
  const response = await fetchAsset(assets, path);
  if (response.status === 404) {
    return { found: false, reason: "returned 404" };
  }
  if (!response.ok) {
    throw assetRequestError(path, `returned ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (!isJsonContentType(contentType)) {
    return { found: false, reason: `returned content type ${contentType ?? "(none)"} instead of JSON` };
  }

  return { found: true, value: await readResponseJson(response, path) };
}

function fetchAsset(assets: AssetsBinding, path: string): Promise<Response> {
  return assets.fetch(
    new Request(new URL(path, "https://assets.local"), {
      headers: { accept: "application/json" },
    }),
  );
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType !== null && jsonContentTypePattern.test(contentType.split(";", 1)[0]!.trim());
}

async function readResponseJson(response: Response, path: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`Cloudflare asset catalog contains invalid JSON: ${path}`);
  }
}

function assetRequestError(path: string, reason: string): Error {
  return new Error(`Cloudflare asset catalog request failed: ${path} ${reason}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
