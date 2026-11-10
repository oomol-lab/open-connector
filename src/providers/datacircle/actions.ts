import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "datacircle";

export const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_apis",
    operationType: "read",
    description: "List every GTM API on the Datacircle sheet.",
    inputSchema: s.object({}),
    outputSchema: s.object({ data: s.unknown("The APIs, as Datacircle returns them.") }),
  }),
  defineProviderAction(service, {
    name: "get_best_for_api",
    operationType: "read",
    description: "Get who is best for one GTM API.",
    inputSchema: s.requiredObject("Input.", {
      slug: s.nonEmptyString("The API's slug, as list_apis returns it."),
    }),
    outputSchema: s.object({ data: s.unknown("The ranking, as Datacircle returns it.") }),
  }),
];
