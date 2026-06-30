import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const providersDir = join(process.cwd(), "src/providers");
const entries = await readdir(providersDir, { withFileTypes: true });
const services = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

function propertyName(service: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(service) ? service : JSON.stringify(service);
}

const lines = [
  'import type { CredentialValidators, ProviderExecutors } from "../core/types.ts";',
  "",
  "/** Lazy-loaded provider executor module shape. */",
  "export type ExecutorModule = {",
  "  credentialValidators?: CredentialValidators;",
  "  executors: ProviderExecutors;",
  "};",
  "",
  "/** Generated lazy imports for provider executors. Do not hand-edit. */",
  "export const executorModules: Record<string, () => Promise<ExecutorModule>> = {",
  ...services.map(
    (service) =>
      `  ${propertyName(service)}: (): Promise<ExecutorModule> => import("./${service}/executors.ts"),`,
  ),
  "};",
];

await writeFile(join(providersDir, "registry.generated.ts"), `${lines.join("\n")}\n`);
console.log(`Generated provider registry for ${services.length} providers.`);
