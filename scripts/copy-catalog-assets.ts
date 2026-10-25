import type { ExecutableActionOptions } from "../src/catalog-store.ts";
import type { ProviderDefinition } from "../src/core/types.ts";
import type { CatalogAssetIndex } from "../src/server/cloudflare/catalog-assets.ts";

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCatalogStore, resolveExecutableActionIds } from "../src/catalog-store.ts";

export const defaultCatalogChunkBytes = 4 * 1024 * 1024;

export interface CopyCatalogAssetsOptions {
  sourceDir: string;
  targetDir: string;
  maxChunkBytes?: number;
  /** Prepare immutable runtime metadata outside the Worker's request CPU budget. */
  prepareRuntime?: ExecutableActionOptions;
}

/** Copy generated provider definitions into deterministic, size-bounded static asset chunks. */
export async function copyCatalogAssets(options: CopyCatalogAssetsOptions): Promise<CatalogAssetIndex> {
  const maxChunkBytes = options.maxChunkBytes ?? defaultCatalogChunkBytes;
  if (!Number.isSafeInteger(maxChunkBytes) || maxChunkBytes < 4) {
    throw new Error("Catalog chunk size must be a safe integer of at least 4 bytes");
  }

  const entries = (await readdir(options.sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const providers = await Promise.all(
    entries.map(async (entry) => {
      const content = await readFile(join(options.sourceDir, entry.name), "utf8");
      try {
        return {
          filename: entry.name,
          json: JSON.stringify(JSON.parse(content) as unknown),
        };
      } catch (cause) {
        throw new Error(`Failed to parse catalog provider file: ${entry.name}`, { cause });
      }
    }),
  );
  let prepared: CatalogAssetIndex["prepared"];
  let summaries: Uint8Array | undefined;
  const schemas = new Map<string, string>();
  if (options.prepareRuntime) {
    const definitions = providers.map(({ json }) => JSON.parse(json) as ProviderDefinition);
    const catalog = createCatalogStore(definitions, {
      executableActionIds: resolveExecutableActionIds(definitions, options.prepareRuntime),
    });
    // Use the existing catalog serializer once at build time, keeping the API bytes and ETag identical.
    for (const provider of definitions) {
      schemas.set(
        provider.service,
        JSON.stringify({
          service: provider.service,
          actions: provider.actions.map(({ id, inputSchema, outputSchema }) => ({ id, inputSchema, outputSchema })),
        }),
      );
    }
    providers.splice(
      0,
      providers.length,
      ...catalog.providers.map((provider) => ({
        filename: `${provider.service}.json`,
        json: JSON.stringify(provider),
      })),
    );
    summaries = catalog.providerSummariesJson;
    prepared = {
      providerSummariesEtag: catalog.providerSummariesEtag,
      executableActionIds: [...catalog.executableActionIds],
      schemaChunks: [],
    };
  }
  const chunks = createChunks(providers, maxChunkBytes);
  const schemaChunks = createChunks(
    [...schemas].map(([filename, json]) => ({ filename, json })),
    maxChunkBytes,
  );
  if (prepared) {
    prepared.schemaChunks = schemaChunks.map((chunk, index) => ({
      file: `schemas-${index.toString().padStart(4, "0")}.json`,
      services: (JSON.parse(chunk) as { service: string }[]).map((provider) => provider.service),
    }));
  }

  await rm(options.targetDir, { recursive: true, force: true });
  await mkdir(options.targetDir, { recursive: true });

  const chunkNames = chunks.map((_, index) => `apps-${index.toString().padStart(4, "0")}.json`);
  const index: CatalogAssetIndex = {
    version: 1,
    providerCount: providers.length,
    chunks: chunkNames,
    prepared,
  };

  if (summaries) await writeFile(join(options.targetDir, "provider-summaries.json"), summaries);
  await Promise.all(
    schemaChunks.map((chunk, index) => writeFile(join(options.targetDir, prepared!.schemaChunks[index]!.file), chunk)),
  );

  await Promise.all([
    writeFile(join(options.targetDir, "index.json"), `${JSON.stringify(index)}\n`),
    ...chunks.map((chunk, index) => writeFile(join(options.targetDir, chunkNames[index]!), chunk)),
  ]);

  return index;
}

interface SerializedProvider {
  filename: string;
  json: string;
}

function createChunks(providers: SerializedProvider[], maxChunkBytes: number): string[] {
  const chunks: string[] = [];
  let entries: string[] = [];
  let chunkBytes = 3; // Opening and closing brackets plus the trailing newline.

  for (const provider of providers) {
    const providerBytes = Buffer.byteLength(provider.json);
    const addedBytes = providerBytes + (entries.length === 0 ? 0 : 1);
    if (providerBytes + 3 > maxChunkBytes) {
      throw new Error(
        `Catalog provider ${provider.filename} requires ${providerBytes + 3} bytes, exceeding the ${maxChunkBytes}-byte chunk limit`,
      );
    }

    if (entries.length > 0 && chunkBytes + addedBytes > maxChunkBytes) {
      chunks.push(`[${entries.join(",")}]\n`);
      entries = [];
      chunkBytes = 3;
    }

    chunkBytes += providerBytes + (entries.length === 0 ? 0 : 1);
    entries.push(provider.json);
  }

  if (entries.length > 0) {
    chunks.push(`[${entries.join(",")}]\n`);
  }

  return chunks;
}

if (import.meta.main) {
  const sourceDir = join(process.cwd(), "catalog/apps");
  const targetDir = join(process.cwd(), "dist/web/catalog");
  const { loadProviderSources } = await import("./provider-source.ts");
  const sources = await loadProviderSources();
  const index = await copyCatalogAssets({
    sourceDir,
    targetDir,
    prepareRuntime: {
      executableServices: sources.filter((source) => !source.nodeOnly).map((source) => source.service),
    },
  });
  console.log(`Copied ${index.providerCount} catalog apps into ${index.chunks.length} static asset chunks.`);
}
