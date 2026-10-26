import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import contracts from "./dataforseo-research-contracts.json" with { type: "json" };

interface ResearchContract {
  name: string;
  path: string;
  description: string;
  inputSchema: JsonSchema & {
    properties: Record<string, unknown>;
  };
}

export const dataForSeoResearchContracts: readonly ResearchContract[] = contracts;

const outputSchema = s.looseObject(
  "The DataForSEO response, preserving task statuses, costs, results, and additional fields.",
  {
    status_code: s.integer("The overall response status code."),
    status_message: s.string("The overall response status message."),
    cost: s.number("The supplier-reported cost."),
    tasks_error: s.integer("The number of failed tasks."),
    tasks: s.nullable(
      s.array(
        "Task results; HTTP success does not imply that every task succeeded.",
        s.looseObject("Task status, errors, and results with upstream fields preserved."),
      ),
    ),
  },
);

export const dataForSeoResearchActions: readonly ActionDefinition[] = dataForSeoResearchContracts.map((contract) =>
  defineProviderAction("aisa", {
    name: contract.name,
    operationType: "read",
    description: contract.description,
    requiredScopes: [],
    inputSchema: contract.inputSchema,
    outputSchema,
  }),
);
