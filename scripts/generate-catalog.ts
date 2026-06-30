import type { ProviderDefinition } from "../src/core/types.ts";

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sortProviders } from "../src/core/catalog.ts";

const outputDir = join(process.cwd(), "catalog/apps");
const providers = await loadProviderDefinitions();
const apps = sortProviders(providers);

await mkdir(outputDir, { recursive: true });

const appFileNames = new Set(apps.map((app) => `${app.service}.json`));
const existingEntries = await readdir(outputDir, { withFileTypes: true });

await Promise.all(
  existingEntries
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(".json") && !appFileNames.has(entry.name),
    )
    .map((entry) => rm(join(outputDir, entry.name))),
);

for (const app of apps) {
  await writeFile(join(outputDir, `${app.service}.json`), `${JSON.stringify(app, null, 2)}\n`);
}

console.log(
  `Generated ${apps.length} apps and ${apps.reduce((sum, app) => sum + app.actions.length, 0)} actions.`,
);

async function loadProviderDefinitions(): Promise<ProviderDefinition[]> {
  const providersDir = join(process.cwd(), "src/providers");
  const entries = await readdir(providersDir, { withFileTypes: true });
  const services = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(
    services.map(async (service): Promise<ProviderDefinition> => {
      const module = (await import(
        `../src/providers/${service}/definition.ts`
      )) as ProviderDefinitionModule;
      return module.provider;
    }),
  );
}

type ProviderDefinitionModule = {
  provider: ProviderDefinition;
};
