import type { ExecutorModules } from "../src/providers/provider-loader.ts";

import { writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { ProviderLoader } from "../src/providers/provider-loader.ts";
import { loadProviderSources } from "./provider-source.ts";

const target = process.argv[2];
if (!target) throw new Error("Pass the Open Flow catalog output path.");
const registryPath = "../src/providers/registry.generated.ts";
const { executorModules } = (await import(registryPath)) as { executorModules: ExecutorModules };
const loader = new ProviderLoader(executorModules);
const entries = [];
for (const { definition: provider } of await loadProviderSources()) {
  if (!provider.triggers?.length) continue;
  for (const trigger of await loader.loadTriggerDefinitions(provider.service)) {
    const snapshot = provider.triggers.find((item) => item.key === trigger.snapshot.key);
    if (!snapshot || !isDeepStrictEqual(snapshot, trigger.snapshot))
      throw new Error(`Trigger metadata drift: ${trigger.snapshot.key}`);
    entries.push({
      snapshot,
      options: trigger.configOptions != null,
      intervalMs: "listener" in trigger ? trigger.listener?.intervalMs : undefined,
      eventSource: "eventSource" in trigger ? trigger.eventSource : undefined,
    });
  }
}
entries.sort((a, b) => a.snapshot.key.localeCompare(b.snapshot.key));
await writeFile(target, JSON.stringify(entries, null, 2) + "\n");
console.log(`Exported ${entries.length} Trigger definitions to ${target}.`);
