import type { CatalogIndexSource } from "../src/catalog-index.ts";

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { catalogIndexFileName, createCatalogIndex } from "../src/catalog-index.ts";
import { sortProviders } from "../src/core/catalog.ts";
import { assertProviderId } from "../src/core/provider-id.ts";
import { generateProviderRegistries } from "./generate-provider-registry.ts";
import { loadProviderSources } from "./provider-source.ts";

const outputDir = join(process.cwd(), "catalog/apps");
const catalogRootDir = join(process.cwd(), "catalog");
const tempOutputDir = join(catalogRootDir, `.apps-${process.pid}-${Date.now()}`);
// The index lives beside catalog/apps/, not inside it, so nothing that treats every apps/*.json as a provider
// needs an exclusion. It is compact JSON: pretty-printing would roughly double it for no reader.
const indexFile = join(catalogRootDir, catalogIndexFileName);
const tempIndexFile = join(catalogRootDir, `.apps-index-${process.pid}-${Date.now()}.json`);
const providerSources = await loadProviderSources();
await generateProviderRegistries(providerSources);
const providers = providerSources.map((source) => source.definition);
const apps = sortProviders(providers);

await mkdir(catalogRootDir, { recursive: true });

try {
  await mkdir(tempOutputDir, { recursive: true });
  const sources: CatalogIndexSource[] = [];
  for (const app of apps) {
    assertProviderId(app.service, "catalog app service");
    const file = `${app.service}.json`;
    const content = `${JSON.stringify(app, null, 2)}\n`;
    await writeFile(join(tempOutputDir, file), content);
    sources.push({ file, bytes: Buffer.byteLength(content), provider: app });
  }
  await writeFile(tempIndexFile, `${JSON.stringify(createCatalogIndex(sources))}\n`);
  // Remove the old index before the apps swap: an interrupted run must never leave an index of the previous
  // catalog beside the new files. Both outputs are renamed into place, so neither is ever partially written.
  await rm(indexFile, { force: true });
  await rm(outputDir, { recursive: true, force: true });
  await rename(tempOutputDir, outputDir);
  await rename(tempIndexFile, indexFile);
} catch (error) {
  await rm(tempOutputDir, { recursive: true, force: true });
  await rm(tempIndexFile, { force: true });
  throw error;
}

console.log(
  `Generated ${apps.length} apps and ${apps.reduce((sum, app) => sum + app.actions.length, 0)} actions, and the startup index ${indexFile}.`,
);
