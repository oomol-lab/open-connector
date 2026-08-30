import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sortProviders } from "../src/core/catalog.ts";
import { assertProviderId } from "../src/core/provider-id.ts";
import { generateProviderRegistries } from "./generate-provider-registry.ts";
import { loadProviderSources } from "./provider-source.ts";

const outputDir = join(process.cwd(), "catalog/apps");
const catalogRootDir = join(process.cwd(), "catalog");
const tempOutputDir = join(catalogRootDir, `.apps-${process.pid}-${Date.now()}`);
const providerSources = await loadProviderSources();
await generateProviderRegistries(providerSources);
const providers = providerSources.map((source) => source.definition);
const apps = sortProviders(providers);

await mkdir(catalogRootDir, { recursive: true });

try {
  await mkdir(tempOutputDir, { recursive: true });
  for (const app of apps) {
    assertProviderId(app.service, "catalog app service");
    await writeFile(join(tempOutputDir, `${app.service}.json`), `${JSON.stringify(app, null, 2)}\n`);
  }
  await rm(outputDir, { recursive: true, force: true });
  await rename(tempOutputDir, outputDir);
} catch (error) {
  await rm(tempOutputDir, { recursive: true, force: true });
  throw error;
}

console.log(`Generated ${apps.length} apps and ${apps.reduce((sum, app) => sum + app.actions.length, 0)} actions.`);
