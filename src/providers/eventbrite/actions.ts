import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "eventbrite";
const objectSchema = s.record(true, { description: "Eventbrite API object." });

export const eventbriteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    operationType: "read",
    description: "List organizations accessible to the connected Eventbrite user.",
    inputSchema: s.actionInput(
      {
        continuation: s.string({ minLength: 1, description: "Optional pagination continuation token." }),
      },
      [],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput(
      { organizations: s.array(objectSchema), pagination: objectSchema },
      "Eventbrite organizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_organization_events",
    operationType: "read",
    description: "List events owned by an Eventbrite organization.",
    inputSchema: s.actionInput(
      {
        organizationId: s.string({ minLength: 1, description: "Eventbrite organization ID." }),
        status: s.string({ minLength: 1, description: "Optional event status filter (e.g. live, draft, ended)." }),
        continuation: s.string({ minLength: 1, description: "Optional pagination continuation token." }),
      },
      ["organizationId"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput({ events: s.array(objectSchema), pagination: objectSchema }, "Organization events."),
  }),
];
