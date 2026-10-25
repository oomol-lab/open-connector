import type {
  CatalogStore,
  ExecutableActionOptions,
  RuntimeActionDefinition,
  RuntimeProviderDefinition,
} from "../../catalog-store.ts";
import type { ProviderDefinition } from "../../core/types.ts";
import type { AssetsBinding } from "./cloudflare-bindings.ts";

import { createCatalogStore, resolveExecutableActionIds } from "../../catalog-store.ts";

const catalogIndexPath = "/catalog/index.json";
const chunkNamePattern = /^apps-\d{4}\.json$/;
const jsonContentTypePattern = /^application\/(?:[\w.+-]+\+)?json$/i;

export interface CatalogAssetIndex {
  version: 1;
  providerCount: number;
  chunks: string[];
  /** Runtime metadata and the console response are computed by the asset build. */
  prepared?: {
    providerSummariesEtag: string;
    executableActionIds: string[];
    schemaChunks: { file: string; services: string[] }[];
  };
}

export async function loadCatalogFromAssets(
  assets: AssetsBinding,
  options: ExecutableActionOptions = {},
): Promise<CatalogStore> {
  const index = parseCatalogIndex(await readJsonAsset(assets, catalogIndexPath), catalogIndexPath);
  const chunks = await Promise.all(index.chunks.map((chunk) => requireProviderArrayAsset(assets, `/catalog/${chunk}`)));
  const providers = chunks.flat();
  if (providers.length !== index.providerCount) {
    throw new Error(
      `Cloudflare asset catalog provider count mismatch: index declares ${index.providerCount}, loaded ${providers.length}`,
    );
  }

  if (index.prepared) {
    const executableActionIds = resolveExecutableActionIds(providers, options);
    const preparedIds = new Set(index.prepared.executableActionIds);
    if (executableActionIds.size !== preparedIds.size || [...executableActionIds].some((id) => !preparedIds.has(id))) {
      throw new Error("Prepared catalog does not match the Worker executor registry; rebuild catalog assets");
    }
    const runtimeProviders = providers as RuntimeProviderDefinition[];
    const actions = runtimeProviders.flatMap((provider) => provider.actions);
    const actionsById = new Map(actions.map((action) => [action.id, action]));
    const summaries = await readJsonAssetResponse(assets, "/catalog/provider-summaries.json");
    return {
      providers: runtimeProviders,
      actions,
      actionsById,
      executableActionIds,
      providerSummariesJson: new Uint8Array(await summaries.arrayBuffer()),
      providerSummariesEtag: index.prepared.providerSummariesEtag,
      getAction: createSchemaLoader(assets, runtimeProviders, actionsById, index.prepared.schemaChunks),
    };
  }
  return createCatalog(providers as ProviderDefinition[], options);
}

function createSchemaLoader(
  assets: AssetsBinding,
  providers: RuntimeProviderDefinition[],
  actionsById: CatalogStore["actionsById"],
  chunks: { file: string; services: string[] }[],
): CatalogStore["getAction"] {
  const byService = new Map(providers.map((provider) => [provider.service, provider]));
  const chunkByService = new Map(
    chunks.flatMap(({ file, services }) => services.map((service) => [service, file] as const)),
  );
  if (providers.some((provider) => !chunkByService.has(provider.service))) {
    throw new Error("Catalog schema chunks do not cover every provider");
  }
  const definitions = new Map<string, RuntimeActionDefinition>();
  const pending = new Map<string, Promise<void>>();
  const load = async (file: string): Promise<void> => {
    const value = await readJsonAsset(assets, `/catalog/${file}`);
    if (!Array.isArray(value)) throw new Error(`Invalid action schema chunk: ${file}`);
    // Validate the whole chunk before publishing definitions, allowing failed loads to retry.
    const expected = chunks.find((chunk) => chunk.file === file)!;
    if (value.length !== expected.services.length) throw new Error(`Invalid action schema chunk: ${file}`);
    for (const [index, entry] of value.entries()) {
      const provider = byService.get(expected.services[index]!);
      if (
        !provider ||
        !isRecord(entry) ||
        entry.service !== provider.service ||
        !Array.isArray(entry.actions) ||
        entry.actions.length !== provider.actions.length
      ) {
        throw new Error(`Invalid action schema chunk: ${file}`);
      }
      for (const [actionIndex, schema] of entry.actions.entries()) {
        if (
          !isRecord(schema) ||
          schema.id !== provider.actions[actionIndex]?.id ||
          !isRecord(schema.inputSchema) ||
          !isRecord(schema.outputSchema)
        ) {
          throw new Error(`Invalid action schema chunk: ${file}`);
        }
      }
    }
    for (const entry of value) {
      for (const [index, schema] of entry.actions.entries()) {
        const action = byService.get(entry.service)!.actions[index]!;
        definitions.set(action.id, { ...action, inputSchema: schema.inputSchema, outputSchema: schema.outputSchema });
      }
    }
  };
  return async (id) => {
    const action = actionsById.get(id);
    if (!action) return undefined;
    const file = chunkByService.get(action.service)!;
    let promise = pending.get(file);
    if (!promise) {
      promise = load(file).catch((error) => {
        pending.delete(file);
        throw error;
      });
      pending.set(file, promise);
    }
    await promise;
    return definitions.get(id)!;
  };
}

function createCatalog(providers: ProviderDefinition[], options: ExecutableActionOptions): CatalogStore {
  return createCatalogStore(providers, {
    executableActionIds: resolveExecutableActionIds(providers, options),
  });
}

function parseCatalogIndex(value: unknown, path: string): CatalogAssetIndex {
  if (!isRecord(value)) {
    throw new Error(`Cloudflare asset catalog index must be an object: ${path}`);
  }
  const keys = Object.keys(value)
    .filter((key) => key !== "prepared")
    .sort();
  if (keys.join(",") !== "chunks,providerCount,version") {
    throw new Error(
      "Cloudflare asset catalog index must contain only version, providerCount, chunks, and optional prepared metadata",
    );
  }
  let prepared: CatalogAssetIndex["prepared"];
  if (value.prepared !== undefined) {
    const metadata = value.prepared;
    if (
      !isRecord(metadata) ||
      typeof metadata.providerSummariesEtag !== "string" ||
      !/^W\/"[a-f0-9]+-[a-f0-9]+"$/.test(metadata.providerSummariesEtag) ||
      !Array.isArray(metadata.executableActionIds) ||
      !metadata.executableActionIds.every((id): id is string => typeof id === "string")
    ) {
      throw new Error("Cloudflare asset catalog index has invalid prepared metadata");
    }
    if (!Array.isArray(metadata.schemaChunks)) throw new Error("Invalid catalog schema chunks");
    const schemaChunks = metadata.schemaChunks.map((chunk) => {
      if (
        !isRecord(chunk) ||
        typeof chunk.file !== "string" ||
        !/^schemas-\d{4}\.json$/.test(chunk.file) ||
        !Array.isArray(chunk.services) ||
        !chunk.services.every((service): service is string => typeof service === "string")
      ) {
        throw new Error("Invalid catalog schema chunks");
      }
      return { file: chunk.file, services: chunk.services };
    });
    prepared = {
      providerSummariesEtag: metadata.providerSummariesEtag,
      executableActionIds: metadata.executableActionIds,
      schemaChunks,
    };
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
    prepared,
  };
}

async function requireProviderArrayAsset(
  assets: AssetsBinding,
  path: string,
): Promise<(ProviderDefinition | RuntimeProviderDefinition)[]> {
  return requireProviderArray(await readJsonAsset(assets, path), path);
}

function requireProviderArray(value: unknown, path: string): (ProviderDefinition | RuntimeProviderDefinition)[] {
  if (!Array.isArray(value)) {
    throw new Error(`Cloudflare asset catalog must be an array: ${path}`);
  }

  return value as (ProviderDefinition | RuntimeProviderDefinition)[];
}

/**
 * Read one catalog asset as JSON.
 *
 * `not_found_handling: "single-page-application"` (see `wrangler.example.jsonc`) makes the assets
 * binding answer an unknown path with `index.html` and status 200 rather than 404, and it does so
 * for binding fetches regardless of the request's `Accept` header. A missing index or chunk is
 * therefore detected by the response content type as well as by the status, otherwise the SPA shell
 * would be parsed as catalog JSON.
 */
async function readJsonAsset(assets: AssetsBinding, path: string): Promise<unknown> {
  return readResponseJson(await readJsonAssetResponse(assets, path), path);
}

async function readJsonAssetResponse(assets: AssetsBinding, path: string): Promise<Response> {
  const response = await fetchAsset(assets, path);
  if (response.status === 404) {
    throw assetRequestError(path, "returned 404");
  }
  if (!response.ok) {
    throw assetRequestError(path, `returned ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (!isJsonContentType(contentType)) {
    throw assetRequestError(path, `returned content type ${contentType ?? "(none)"} instead of JSON`);
  }

  return response;
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
