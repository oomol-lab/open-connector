import type { ProviderSource } from "./provider-source.ts";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProviderSources } from "./provider-source.ts";

const providersDir = join(process.cwd(), "src/providers");
const providerSources = await loadProviderSources();

await Promise.all([
  writeRegistry("registry.generated.ts", providerSources),
  writeRegistry(
    "registry.cloudflare.generated.ts",
    providerSources.filter((source) => !source.nodeOnly),
  ),
]);

function propertyName(service: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(service) ? service : JSON.stringify(service);
}

async function writeRegistry(filename: string, sources: ProviderSource[]): Promise<void> {
  const services = sources.map((source) => source.service);
  const executableActionIds = new Map<string, string[]>(
    sources.map((source) => [
      source.service,
      source.definition.actions.map((action) => action.id).sort((a, b) => a.localeCompare(b)),
    ]),
  );
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
    "/** Generated local executable action ids by provider. Do not hand-edit. */",
    "export const executableActionIds: Record<string, string[]> = {",
    ...services.flatMap((service) => [
      `  ${propertyName(service)}: [`,
      ...(executableActionIds.get(service) ?? []).map((actionId) => `    ${JSON.stringify(actionId)},`),
      "  ],",
    ]),
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
