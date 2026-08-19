import type { ProviderConformanceFinding } from "../src/providers/provider-conformance.ts";
import type { ExecutorModule } from "../src/providers/provider-loader.ts";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertProviderActionIdentity,
  diffCatalogAndExecutorKeys,
  findMissingPrivateNetworkRatchetProviders,
  findingFromActionExecutorGap,
  formatConformanceFindings,
  scanProviderEgressPolicy,
  scanProviderRuntimeSource,
  scanProviderSkipDnsPolicy,
} from "../src/providers/provider-conformance.ts";
import { loadProviderSources } from "./provider-source.ts";

const providersDir = join(process.cwd(), "src/providers");

const findings: ProviderConformanceFinding[] = [];
const sources = await loadProviderSources();

for (const source of sources) {
  assertProviderActionIdentity(source.definition);

  let executorModule: ExecutorModule;
  try {
    executorModule = (await import(`../src/providers/${source.service}/executors.ts`)) as ExecutorModule;
  } catch (error) {
    findings.push({
      service: source.service,
      file: "executors.ts",
      kind: "catalog_action_mismatch",
      detail: `failed to import executors.ts: ${error instanceof Error ? error.message : String(error)}`,
    });
    continue;
  }

  if (!executorModule.executors || typeof executorModule.executors !== "object") {
    findings.push({
      service: source.service,
      file: "executors.ts",
      kind: "catalog_action_mismatch",
      detail: "executors.ts must export an executors object",
    });
    continue;
  }

  const gap = diffCatalogAndExecutorKeys({
    service: source.service,
    catalogActionIds: source.definition.actions.map((action) => action.id),
    executorKeys: Object.keys(executorModule.executors),
  });
  if (gap) {
    findings.push(findingFromActionExecutorGap(gap));
  }

  const files = await listProviderTypeScriptFiles(source.service);
  const sourceFiles = await Promise.all(
    files.map(async (fileName) => ({
      fileName,
      text: await readFile(join(providersDir, source.service, fileName), "utf8"),
    })),
  );
  for (const file of sourceFiles) {
    findings.push(
      ...scanProviderRuntimeSource({
        service: source.service,
        fileName: file.fileName,
        nodeOnly: source.nodeOnly,
        text: file.text,
      }),
    );
  }
  findings.push(
    ...scanProviderSkipDnsPolicy({
      service: source.service,
      files: sourceFiles.map((file) => ({
        service: source.service,
        fileName: file.fileName,
        nodeOnly: source.nodeOnly,
        text: file.text,
      })),
    }),
    ...scanProviderEgressPolicy({
      service: source.service,
      files: sourceFiles.map((file) => ({
        service: source.service,
        fileName: file.fileName,
        nodeOnly: source.nodeOnly,
        text: file.text,
      })),
    }),
  );
}

findings.push(
  ...findMissingPrivateNetworkRatchetProviders({
    scannedServices: sources.map((source) => source.service),
  }),
);

if (findings.length > 0) {
  console.error(`Provider runtime conformance failed (${findings.length} finding(s)):`);
  console.error(formatConformanceFindings(findings));
  process.exitCode = 1;
} else {
  console.log(`Provider runtime conformance passed for ${sources.length} providers.`);
}

async function listProviderTypeScriptFiles(service: string): Promise<string[]> {
  return listTypeScriptFiles(join(providersDir, service), "");
}

async function listTypeScriptFiles(directory: string, relativePrefix: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(join(directory, entry.name), relativePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(relativePath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}
