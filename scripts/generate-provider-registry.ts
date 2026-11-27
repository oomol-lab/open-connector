import type { ProviderSource } from "./provider-source.ts";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { format } from "oxfmt";
import {
  assertKnownProviders,
  formatProviderAllowlistMarker,
  providerAllowlistVariable,
  readProviderAllowlist,
} from "./provider-allowlist.ts";
import { loadProviderSources } from "./provider-source.ts";

const providersDir = join(process.cwd(), "src/providers");

export interface GenerateProviderRegistriesOptions {
  /** Directory the generated files are written to. Defaults to `src/providers`. */
  outputDir?: string;
  /** Providers the Workers registry keeps. Defaults to `OPENCONNECTOR_PROVIDERS`; `undefined` keeps all of them. */
  allowlist?: readonly string[] | undefined;
}

/**
 * Generate provider registries from definitions already loaded by the caller.
 *
 * The allowlist only narrows the Workers registry, where esbuild bundles every `import()` it can see. The Node
 * registry stays complete: Node resolves each `import()` only when a provider first runs, so unused providers cost
 * nothing there, and the Node server serves the full `catalog/apps`, whose providers would otherwise turn
 * non-executable. The action contracts stay complete too, because every provider's source is still typechecked.
 */
export async function generateProviderRegistries(
  providerSources: ProviderSource[],
  options: GenerateProviderRegistriesOptions = {},
): Promise<void> {
  const outputDir = options.outputDir ?? providersDir;
  const allowlist = "allowlist" in options ? options.allowlist : readProviderAllowlist();
  const workerSources = selectWorkerSources(providerSources, allowlist);
  const workerServices = new Set(workerSources.map((source) => source.service));
  await Promise.all([
    writeRegistry(outputDir, "registry.generated.ts", providerSources),
    writeRegistry(
      outputDir,
      "registry.cloudflare.generated.ts",
      workerSources,
      providerSources.filter((source) => !workerServices.has(source.service)),
      allowlist,
    ),
    writeActionContracts(outputDir, providerSources),
  ]);
}

if (import.meta.main) {
  await generateProviderRegistries(await loadProviderSources());
}

/** The providers the Workers registry can run: every Workers-capable one, or exactly the allowlisted ones. */
function selectWorkerSources(sources: ProviderSource[], allowlist: readonly string[] | undefined): ProviderSource[] {
  if (!allowlist) {
    return sources.filter((source) => !source.nodeOnly);
  }

  assertKnownProviders(
    allowlist,
    sources.map((source) => source.service),
  );
  const selected = new Set(allowlist);
  const nodeOnly = sources.filter((source) => source.nodeOnly && selected.has(source.service));
  if (nodeOnly.length > 0) {
    throw new Error(
      `${providerAllowlistVariable} lists Node-only providers that cannot run on Cloudflare Workers: ${nodeOnly
        .map((source) => source.service)
        .join(", ")}`,
    );
  }
  return sources.filter((source) => selected.has(source.service));
}

function propertyName(service: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(service) ? service : JSON.stringify(service);
}

/**
 * Write one executor registry. `excluded` lists bundled providers this registry leaves out, such as the Node-only
 * ones on Workers or those outside the allowlist, so the entry point still knows and reserves every bundled service id.
 */
async function writeRegistry(
  outputDir: string,
  filename: string,
  sources: ProviderSource[],
  excluded?: ProviderSource[],
  allowlist?: readonly string[],
): Promise<void> {
  const services = sources.map((source) => source.service);
  const lines = [
    'import type { ExecutorModule } from "./provider-loader.ts";',
    "",
    ...(allowlist ? [formatProviderAllowlistMarker(allowlist)] : []),
    "/** Generated lazy imports for provider executors. Do not hand-edit. */",
    "export const executorModules: Record<string, () => Promise<ExecutorModule>> = {",
    ...services.map(
      (service) => `  ${propertyName(service)}: (): Promise<ExecutorModule> => import("./${service}/executors.ts"),`,
    ),
    "};",
  ];
  if (excluded) {
    lines.push(
      "",
      "/** Bundled providers that are left out of this registry. Do not hand-edit. */",
      "export const excludedServices: readonly string[] = [",
      ...excluded.map((source) => `  ${JSON.stringify(source.service)},`),
      "];",
    );
  }

  const path = join(outputDir, filename);
  const content = `${lines.join("\n")}\n`;
  const existingContent = await readTextFile(path);
  if (existingContent !== content) {
    await writeFile(path, content);
    console.log(`Generated ${filename} (${services.length} providers).`);
  } else {
    console.log(`${filename} is up to date (${services.length} providers).`);
  }
}

async function writeActionContracts(outputDir: string, sources: ProviderSource[]): Promise<void> {
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
  const filename = "action-contracts.generated.ts";
  const path = join(outputDir, filename);
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
    console.log(`Generated ${filename} (${sources.length} providers).`);
  } else {
    console.log(`${filename} is up to date (${sources.length} providers).`);
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
