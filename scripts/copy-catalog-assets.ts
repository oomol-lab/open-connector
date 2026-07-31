import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const defaultCatalogChunkBytes = 4 * 1024 * 1024;

export interface CopyCatalogAssetsOptions {
  sourceDir: string;
  targetDir: string;
  maxChunkBytes?: number;
}

export interface CatalogAssetIndex {
  version: 1;
  providerCount: number;
  chunks: string[];
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
  const chunks = createChunks(providers, maxChunkBytes);

  await rm(options.targetDir, { recursive: true, force: true });
  await mkdir(options.targetDir, { recursive: true });

  const chunkNames = chunks.map((_, index) => `apps-${index.toString().padStart(4, "0")}.json`);
  const index: CatalogAssetIndex = {
    version: 1,
    providerCount: providers.length,
    chunks: chunkNames,
  };

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
  const index = await copyCatalogAssets({ sourceDir, targetDir });
  console.log(`Copied ${index.providerCount} catalog apps into ${index.chunks.length} static asset chunks.`);
}
