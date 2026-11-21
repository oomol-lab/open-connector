import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "convertkit";
const objectSchema = s.record(true, { description: "Kit API object." });

export const convertkitActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_subscribers",
    operationType: "read",
    description: "List subscribers in the connected Kit (ConvertKit) account.",
    inputSchema: s.actionInput(
      {
        perPage: s.integer({ minimum: 1, maximum: 500, description: "Maximum subscribers to return per page." }),
        after: s.string({ minLength: 1, description: "Pagination cursor for the next page." }),
      },
      [],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput({ subscribers: s.array(objectSchema), pagination: objectSchema }, "Subscriber list."),
  }),
  defineProviderAction(service, {
    name: "create_subscriber",
    operationType: "write",
    description: "Create or update a subscriber in Kit (ConvertKit).",
    inputSchema: s.actionInput(
      {
        emailAddress: s.email("Subscriber email address."),
        firstName: s.string({ minLength: 1, description: "Optional subscriber first name." }),
      },
      ["emailAddress"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput({ subscriber: objectSchema }, "Created or updated subscriber."),
  }),
];
