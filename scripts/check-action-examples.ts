import type { ProviderDefinition } from "../src/core/types.ts";

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { validateActionInput } from "../src/core/validation.ts";
import { buildExampleInput } from "../src/server/api/action-example.ts";

// Run after generate:catalog. Read one provider at a time and skip Markdown rendering.
const directory = join(process.cwd(), "catalog/apps");
const started = performance.now();
let actions = 0;
let failures = 0;
let generationMs = 0;
for (const file of await readdir(directory)) {
  if (!file.endsWith(".json")) {
    continue;
  }
  const provider: ProviderDefinition = JSON.parse(await readFile(join(directory, file), "utf8"));
  for (const action of provider.actions) {
    actions += 1;
    try {
      const start = performance.now();
      const input = buildExampleInput(action.inputSchema);
      generationMs += performance.now() - start;
      const result = validateActionInput(action, input);
      if (!result.valid) {
        failures += 1;
        console.error(`FAIL ${action.id}\n  Input: ${JSON.stringify(input)}`);
        for (const error of result.errors) {
          console.error(`  ${error.instanceLocation}: ${error.error} (${error.keywordLocation})`);
        }
      }
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${action.id}`, error);
    }
  }
}
console.log(
  `Action examples: ${actions - failures}/${actions} passed, ${failures} failed. ` +
    `${Math.round(performance.now() - started)} ms total, ${Math.round(generationMs)} ms generating, ` +
    `${Math.round(process.resourceUsage().maxRSS / 1024)} MiB peak RSS.`,
);
if (failures > 0) {
  console.error(
    "Investigate src/server/api/action-example.ts first: provider schemas are based on official API documentation, " +
      "so example failures usually indicate a generation bug. Change a schema only when official documentation " +
      "or other API contract evidence confirms it is incorrect; do not relax constraints just to pass this check.",
  );
}
process.exitCode = failures > 0 ? 1 : 0;
