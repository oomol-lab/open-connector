import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ticket_source";
const resourceId = s.nonEmptyString("The case-sensitive TicketSource resource identifier.");
const page = s.positiveInteger("The one-based page number to return.");
const perPage = s.integer("The number of resources to return per page, up to 100.", {
  minimum: 1,
  maximum: 100,
});
const resource = s.object("A TicketSource resource.", {
  id: s.string("The case-sensitive TicketSource resource identifier."),
  type: s.string("The TicketSource resource type."),
  attributes: s.looseObject("The attributes returned for the resource."),
  links: s.looseObject("The related resource links returned by TicketSource."),
});
const links = s.looseObject("The pagination links returned by TicketSource.");
const meta = s.looseObject("The pagination metadata returned by TicketSource.");
const pagination = { page, perPage };

export const ticketSourceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_events",
    operationType: "read",
    description: "List events in the connected TicketSource account.",
    requiredScopes: [],
    inputSchema: s.object("Pagination for listing TicketSource events.", pagination, {
      optional: ["page", "perPage"],
    }),
    outputSchema: s.object("The paginated TicketSource event response.", {
      events: s.array("The events returned by TicketSource.", resource),
      links,
      meta,
    }),
  }),
  defineProviderAction(service, {
    name: "get_event",
    operationType: "read",
    description: "Get one TicketSource event by its case-sensitive identifier.",
    requiredScopes: [],
    inputSchema: s.object("Input for getting a TicketSource event.", { eventId: resourceId }),
    outputSchema: s.object("The TicketSource event response.", { event: resource }),
  }),
  defineProviderAction(service, {
    name: "list_event_venues",
    operationType: "read",
    description: "List venues associated with a TicketSource event.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing venues associated with an event.",
      { eventId: resourceId, ...pagination },
      {
        optional: ["page", "perPage"],
      },
    ),
    outputSchema: s.object("The paginated TicketSource venue response.", {
      venues: s.array("The venues returned by TicketSource.", resource),
      links,
      meta,
    }),
  }),
  defineProviderAction(service, {
    name: "list_event_dates",
    operationType: "read",
    description: "List performance dates associated with a TicketSource event.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing dates associated with an event.",
      { eventId: resourceId, ...pagination },
      {
        optional: ["page", "perPage"],
      },
    ),
    outputSchema: s.object("The paginated TicketSource date response.", {
      dates: s.array("The dates returned by TicketSource.", resource),
      links,
      meta,
    }),
  }),
];
