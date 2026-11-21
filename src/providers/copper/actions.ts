import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "copper";
const objectSchema = s.record(true, { description: "Copper CRM API object." });

export const copperActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_people",
    operationType: "read",
    description: "Search people records in Copper CRM.",
    inputSchema: s.actionInput(
      {
        name: s.string({ minLength: 1, description: "Optional person name filter." }),
        pageSize: s.integer({ minimum: 1, maximum: 200, description: "Maximum records per page." }),
      },
      [],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput({ people: s.array(objectSchema) }, "Matched people records."),
  }),
  defineProviderAction(service, {
    name: "get_person",
    operationType: "read",
    description: "Get one person record by ID in Copper CRM.",
    inputSchema: s.actionInput(
      { personId: s.integer({ minimum: 1, description: "Copper person ID." }) },
      ["personId"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput({ person: objectSchema }, "Copper person record."),
  }),
];
