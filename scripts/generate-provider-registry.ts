import type { ProviderSource } from "./provider-source.ts";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { format } from "oxfmt";
import { loadProviderSources } from "./provider-source.ts";

const providersDir = join(process.cwd(), "src/providers");

/**
 * Generate provider registries from definitions already loaded by the caller.
 */
export async function generateProviderRegistries(providerSources: ProviderSource[]): Promise<void> {
  await Promise.all([
    writeRegistry("registry.generated.ts", providerSources),
    writeRegistry(
      "registry.cloudflare.generated.ts",
      providerSources.filter((source) => !source.nodeOnly),
    ),
    writeActionContracts(providerSources),
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
  const lines = [
    'import type { ExecutorModule } from "./provider-loader.ts";',
    "",
    "/** Generated lazy imports for provider executors. Do not hand-edit. */",
    "export const executorModules: Record<string, () => Promise<ExecutorModule>> = {",
    ...services.map(
      (service) => `  ${propertyName(service)}: (): Promise<ExecutorModule> => import("./${service}/executors.ts"),`,
    ),
    "};",
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

async function writeActionContracts(sources: ProviderSource[]): Promise<void> {
  const lines = [
    "/** Generated action-name contracts for provider handlers. Do not hand-edit. */",
    "export interface ProviderActionNames {",
  ];

  for (const source of sources) {
    const names = [...new Set(source.definition.actions.map((action) => action.name))];
    if (names.length === 0) {
      lines.push(`  ${propertyName(source.service)}: never;`);
    } else if (names.length === 1) {
      lines.push(`  ${propertyName(source.service)}: ${JSON.stringify(names[0])};`);
    } else {
      lines.push(`  ${propertyName(source.service)}:`);
      lines.push(...names.map((name) => `    | ${JSON.stringify(name)}`));
      lines[lines.length - 1] += ";";
    }
  }

  lines.push("}");
  const path = join(providersDir, "action-contracts.generated.ts");
  const result = await format(path, `${lines.join("\n")}\n`, {
    printWidth: 120,
    trailingComma: "all",
  });
  if (result.errors.length > 0) {
    throw new Error(`Failed to format generated action contracts: ${result.errors[0]!.message}`);
  }
  const content = result.code;
  const existingContent = await readTextFile(path);
  if (existingContent !== content) {
    await writeFile(path, content);
    console.log(`Generated action contracts for ${sources.length} providers.`);
  } else {
    console.log(`Action contracts are up to date for ${sources.length} providers.`);
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
