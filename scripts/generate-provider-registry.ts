import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadProviderSources } from "./provider-source.ts";

const providersDir = join(process.cwd(), "src/providers");
const providerSources = await loadProviderSources();
const services = providerSources.map((source) => source.service);
const executableActionIds = new Map<string, string[]>(
  providerSources.map((source) => [
    source.service,
    source.definition.actions.map((action) => action.id).sort((a, b) => a.localeCompare(b)),
  ]),
);

function propertyName(service: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(service) ? service : JSON.stringify(service);
}

const lines = [
  'import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../core/types.ts";',
  "",
  "/** Lazy-loaded provider executor module shape. */",
  "export type ExecutorModule = {",
  "  credentialValidators?: CredentialValidators;",
  "  executors: ProviderExecutors;",
  "  proxy?: ProviderProxyExecutor;",
  "};",
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

const registryPath = join(providersDir, "registry.generated.ts");
const registryContent = `${lines.join("\n")}\n`;
const existingContent = await readTextFile(registryPath);
if (existingContent !== registryContent) {
  await writeFile(registryPath, registryContent);
  console.log(`Generated provider registry for ${services.length} providers.`);
} else {
  console.log(`Provider registry is up to date for ${services.length} providers.`);
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
