import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runTriggerConformance } from "./conformance.ts";

const adapter = process.argv[2];
if (!adapter) throw new Error("Pass the path to a Trigger conformance adapter.");
const { createHarness } = await import(pathToFileURL(resolve(adapter)).href);
if (typeof createHarness !== "function") throw new Error("The adapter must export createHarness.");
await runTriggerConformance(createHarness);
