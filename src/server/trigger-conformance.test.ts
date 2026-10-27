import { test } from "vitest";
import { runTriggerConformance } from "../../contracts/triggers/conformance.ts";
import { createHarness } from "./trigger-conformance-adapter.ts";

test("registered Trigger operations satisfy the shared behavioral contract", async () => {
  await runTriggerConformance(createHarness);
});
