import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "route4me";
const isoDateSchema = s.stringPattern("^\\d{4}-\\d{2}-\\d{2}$", {
  description: "An ISO date string in YYYY-MM-DD format.",
});
const optimizationStateSchema = s.integer("The optimization state filter documented by Route4Me.", {
  minimum: 0,
  maximum: 6,
});
const addressInputSchema = s.looseRequiredObject("One Route4Me destination object.", {
  address: s.nonEmptyString("The destination address or label accepted by Route4Me."),
});
const optimizationSummarySchema = s.object("A normalized Route4Me optimization summary.", {
  optimizationProblemId: s.nonEmptyString("The optimization problem identifier."),
  state: s.nullableInteger("The Route4Me optimization state when present."),
  routeIds: s.stringArray("The route IDs returned inside the optimization response."),
  routeCount: s.nonNegativeInteger("The number of routes included in the optimization response."),
  addressCount: s.nonNegativeInteger("The number of addresses included in the optimization response."),
  raw: s.looseObject("The raw optimization object returned by Route4Me."),
});

export const route4meActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_optimization",
    description: "Create a Route4Me optimization problem from parameters and destination addresses.",
    inputSchema: s.object("The input payload for creating a Route4Me optimization problem.", {
      parameters: s.looseObject("The optimization parameters object accepted by Route4Me."),
      addresses: s.array("The destination list to optimize.", addressInputSchema, { minItems: 1 }),
    }),
    outputSchema: optimizationSummarySchema,
  }),
  defineProviderAction(service, {
    name: "list_optimizations",
    description: "List Route4Me optimization problems, or fetch one optimization by its ID.",
    inputSchema: s.object(
      "The input payload for listing Route4Me optimization problems.",
      {
        optimizationProblemId: s.nonEmptyString("The optimization problem ID to fetch directly."),
        state: optimizationStateSchema,
        limit: s.nonNegativeInteger("The maximum number of optimization problems to return."),
        offset: s.nonNegativeInteger("The result offset used for pagination."),
        startDate: isoDateSchema,
        endDate: isoDateSchema,
      },
      { optional: ["optimizationProblemId", "state", "limit", "offset", "startDate", "endDate"] },
    ),
    outputSchema: s.object("The normalized Route4Me optimization list response.", {
      optimizations: s.array("The optimization summaries returned by Route4Me.", optimizationSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_optimizations",
    description: "Delete one or more Route4Me optimization problems by ID.",
    inputSchema: s.object("The input payload for deleting Route4Me optimization problems.", {
      optimizationProblemIds: s.stringArray("The optimization problem IDs to delete.", {
        minItems: 1,
        itemDescription: "One Route4Me optimization problem ID.",
      }),
    }),
    outputSchema: s.object("The normalized Route4Me optimization deletion response.", {
      status: s.boolean("Whether Route4Me reported a successful deletion."),
      removed: s.nonNegativeInteger("The number of optimization problems removed by Route4Me."),
      raw: s.looseObject("The raw deletion response returned by Route4Me."),
    }),
  }),
];
