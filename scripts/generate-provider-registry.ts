import type { ProviderSource } from "./provider-source.ts";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertProviderActionIdentity,
  executableActionIdsFromProviders,
} from "../src/providers/provider-conformance.ts";
import { loadProviderSources } from "./provider-source.ts";

const providersDir = join(process.cwd(), "src/providers");

/**
 * Generate provider registries from definitions already loaded by the caller.
 */
export async function generateProviderRegistries(providerSources: ProviderSource[]): Promise<void> {
  for (const source of providerSources) {
    assertProviderActionIdentity(source.definition);
  }

  await Promise.all([
    writeRegistry("registry.generated.ts", providerSources),
    writeRegistry(
      "registry.cloudflare.generated.ts",
      providerSources.filter((source) => !source.nodeOnly),
    ),
  ]);
}

if (import.meta.main) {
  await generateProviderRegistries(await loadProviderSources());
}

function propertyName(service: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(service) ? service : JSON.stringify(service);
}

async function writeRegistry(filename: string, sources: ProviderSource[]): Promise<void> {
  const services = sources.map((source) => source.service);
  const actionIds = executableActionIdsFromProviders(sources.map((source) => source.definition));
  const lines = [
    'import type { ExecutorModule } from "./provider-loader.ts";',
    "",
    "/** Generated lazy imports for provider executors. Do not hand-edit. */",
    "export const executorModules: Record<string, () => Promise<ExecutorModule>> = {",
    ...services.map(
      (service) => `  ${propertyName(service)}: (): Promise<ExecutorModule> => import("./${service}/executors.ts"),`,
    ),
    "};",
    "",
    "/** Catalog action ids that have a local executor in this runtime. Do not hand-edit. */",
    "export const executableActionIds: readonly string[] = [",
    ...actionIds.map((actionId) => `  ${JSON.stringify(actionId)},`),
    "];",
  ];

  const path = join(providersDir, filename);
  const content = `${lines.join("\n")}\n`;
  const existingContent = await readTextFile(path);
  if (existingContent !== content) {
    await writeFile(path, content);
    console.log(`Generated ${filename} for ${services.length} providers.`);
  } else {
    console.log(`${filename} is up to date for ${services.length} providers.`);
  }
}

async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}
