import type { ActionDefinition, ExecutionContext } from "./types.ts";

import { describe, expect, it } from "vitest";
import { executeAction } from "./execution.ts";

const action: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo input.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: {
    type: "object",
    required: ["message"],
    properties: {
      message: { type: "string" },
    },
  },
  outputSchema: { type: "object" },
};

const context: ExecutionContext = {
  async getCredential() {
    return undefined;
  },
};

describe("executeAction", () => {
  it("returns executor_unavailable before validating catalog-only actions", async () => {
    await expect(executeAction(action, undefined, {}, context)).resolves.toMatchObject({
      ok: false,
      error: {
        code: "executor_unavailable",
      },
    });
  });

  it("validates input when an executor is available", async () => {
    await expect(executeAction(action, async () => ({ ok: true, output: {} }), {}, context)).resolves.toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
      },
    });
  });
});
