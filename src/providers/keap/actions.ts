import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "keap";
const objectSchema = s.record(true, { description: "Keap API object." });

export const keapActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List contacts in the connected Keap CRM account.",
    inputSchema: s.actionInput(
      {
        limit: s.integer({ minimum: 1, maximum: 1000, description: "Maximum contacts to return." }),
        offset: s.integer({ minimum: 0, description: "Pagination offset." }),
      },
      [],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput({ contacts: s.array(objectSchema), count: s.integer() }, "Keap contacts list."),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get one contact by ID in Keap.",
    inputSchema: s.actionInput(
      { contactId: s.integer({ minimum: 1, description: "Keap contact ID." }) },
      ["contactId"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput({ contact: objectSchema }, "Keap contact record."),
  }),
];
