import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ticket_tailor";

const resourceSchema = s.looseObject("A Ticket Tailor resource returned by the API.", {
  id: s.nonEmptyString("The Ticket Tailor resource identifier."),
  object: s.string("The Ticket Tailor resource type when returned by the API."),
});

const cursorSchema = s.nonEmptyString("A Ticket Tailor object ID used as a cursor for pagination.");

const paginationShape = {
  starting_after: cursorSchema,
  ending_before: cursorSchema,
  limit: s.integer("The maximum number of resources to return.", {
    minimum: 1,
    maximum: 100,
  }),
};

const paginationInputSchema = s.object(
  "Cursor pagination parameters for a Ticket Tailor list request.",
  paginationShape,
  { optional: ["starting_after", "ending_before", "limit"] },
);

const timestampFilterShape = {
  created_at: s.integer("Filter resources created at this Unix timestamp."),
  "created_at.gt": s.integer("Filter resources created after this Unix timestamp."),
  "created_at.gte": s.integer("Filter resources created at or after this Unix timestamp."),
  "created_at.lt": s.integer("Filter resources created before this Unix timestamp."),
  "created_at.lte": s.integer("Filter resources created at or before this Unix timestamp."),
};

const eventListInputSchema = s.object(
  "Filters and cursor pagination for listing Ticket Tailor events.",
  {
    ...paginationShape,
    start_at: s.integer("Filter events starting at this Unix timestamp."),
    "start_at.gt": s.integer("Filter events starting after this Unix timestamp."),
    "start_at.gte": s.integer("Filter events starting at or after this Unix timestamp."),
    "start_at.lt": s.integer("Filter events starting before this Unix timestamp."),
    "start_at.lte": s.integer("Filter events starting at or before this Unix timestamp."),
    end_at: s.integer("Filter events ending at this Unix timestamp."),
    "end_at.gt": s.integer("Filter events ending after this Unix timestamp."),
    "end_at.gte": s.integer("Filter events ending at or after this Unix timestamp."),
    "end_at.lt": s.integer("Filter events ending before this Unix timestamp."),
    "end_at.lte": s.integer("Filter events ending at or before this Unix timestamp."),
    status: s.nonEmptyString("A comma-separated list of event statuses: published, draft, or sales_closed."),
    name: s.nonEmptyString("Filter events by name."),
    venue: s.nonEmptyString("Filter events by venue."),
  },
  {
    optional: [
      "starting_after",
      "ending_before",
      "limit",
      "start_at",
      "start_at.gt",
      "start_at.gte",
      "start_at.lt",
      "start_at.lte",
      "end_at",
      "end_at.gt",
      "end_at.gte",
      "end_at.lt",
      "end_at.lte",
      "status",
      "name",
      "venue",
    ],
  },
);

const issuedTicketListInputSchema = s.object(
  "Filters and cursor pagination for listing Ticket Tailor issued tickets.",
  {
    ...paginationShape,
    event_id: s.nonEmptyString("Filter issued tickets by event ID."),
    event_series_id: s.nonEmptyString("Filter issued tickets by event series ID."),
    order_id: s.nonEmptyString("Filter issued tickets by order ID."),
    barcode: s.nonEmptyString("Filter issued tickets by barcode."),
    name: s.nonEmptyString("Filter issued tickets by attendee name."),
    email: s.email("Filter issued tickets by attendee email address."),
    reference: s.nonEmptyString("Filter issued tickets by external reference."),
    status: s.stringEnum("Filter issued tickets by status.", ["valid", "voided"]),
    ...timestampFilterShape,
  },
  {
    optional: [
      "starting_after",
      "ending_before",
      "limit",
      "event_id",
      "event_series_id",
      "order_id",
      "barcode",
      "name",
      "email",
      "reference",
      "status",
      "created_at",
      "created_at.gt",
      "created_at.gte",
      "created_at.lt",
      "created_at.lte",
    ],
  },
);

const orderListInputSchema = s.object(
  "Filters and cursor pagination for listing Ticket Tailor orders.",
  {
    ...paginationShape,
    ...timestampFilterShape,
    name: s.nonEmptyString("Filter orders by the buyer's first, last, or full name."),
    email: s.email("Filter orders by the buyer's email address."),
    txn_id: s.nonEmptyString("Filter orders by transaction ID."),
    barcode: s.nonEmptyString("Filter orders by ticket barcode."),
    event_id: s.nonEmptyString("A comma-separated list of event IDs used to filter orders."),
    event_series_id: s.nonEmptyString("A comma-separated list of event series IDs used to filter orders."),
    status: s.stringEnum("Filter orders by status.", ["completed", "pending", "canceled"]),
    store_id: s.nonEmptyString("Filter orders by a store ID prefixed with st_."),
    referral_tag: s.nonEmptyString("Filter orders by the referral tracking tag."),
  },
  {
    optional: [
      "starting_after",
      "ending_before",
      "limit",
      "created_at",
      "created_at.gt",
      "created_at.gte",
      "created_at.lt",
      "created_at.lte",
      "name",
      "email",
      "txn_id",
      "barcode",
      "event_id",
      "event_series_id",
      "status",
      "store_id",
      "referral_tag",
    ],
  },
);

const listOutputSchema = s.looseObject("A Ticket Tailor list response.", {
  data: s.array("Resources returned by Ticket Tailor.", resourceSchema),
  links: s.looseObject("Pagination links returned by Ticket Tailor.", {
    next: s.nullable(s.string("The URL for the next page when one exists.")),
    previous: s.nullable(s.string("The URL for the previous page when one exists.")),
  }),
});

function listAction(name: string, description: string, inputSchema = paginationInputSchema) {
  return defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    inputSchema,
    outputSchema: listOutputSchema,
  });
}

function getAction(name: string, description: string, field: string, fieldDescription: string) {
  return defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    inputSchema: s.object("The Ticket Tailor resource lookup parameters.", {
      [field]: s.nonEmptyString(fieldDescription),
    }),
    outputSchema: resourceSchema,
  });
}

export const ticketTailorActions: readonly ActionDefinition[] = [
  listAction("list_events", "List events belonging to the connected Ticket Tailor box office.", eventListInputSchema),
  getAction(
    "get_event",
    "Retrieve one event belonging to the connected Ticket Tailor box office.",
    "event_id",
    "The Ticket Tailor event ID to retrieve.",
  ),
  listAction("list_orders", "List orders belonging to the connected Ticket Tailor box office.", orderListInputSchema),
  getAction(
    "get_order",
    "Retrieve one order belonging to the connected Ticket Tailor box office.",
    "order_id",
    "The Ticket Tailor order ID to retrieve.",
  ),
  listAction(
    "list_issued_tickets",
    "List tickets issued by the connected Ticket Tailor box office.",
    issuedTicketListInputSchema,
  ),
  getAction(
    "get_issued_ticket",
    "Retrieve one issued ticket from the connected Ticket Tailor box office.",
    "issued_ticket_id",
    "The Ticket Tailor issued ticket ID to retrieve.",
  ),
];
import type { ActionDefinition } from "../../core/types.ts";
