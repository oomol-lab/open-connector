import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "freshdesk";

const includeItemSchema = s.stringEnum("Freshdesk include token to expand related records in a ticket response.", [
  "requester",
  "company",
  "stats",
  "description",
]);

const ticketIncludeSchema = s.array(
  "Freshdesk include tokens to expand related records in ticket responses.",
  includeItemSchema,
  { minItems: 1 },
);

const paginationPageSchema = s.positiveInteger("Page number for the Freshdesk list request.");
const paginationPerPageSchema = s.integer("Maximum number of records to return per Freshdesk page.", {
  minimum: 1,
  maximum: 100,
});

const accountInputSchema = s.object("Input parameters for reading Freshdesk account details.", {});

const accountOutputSchema = s.requiredObject("Freshdesk account response wrapper.", {
  account: s.looseObject("Freshdesk account details."),
});

const listTicketsInputSchema: JsonSchema = {
  ...s.object(
    "Input parameters for listing Freshdesk tickets.",
    {
      filter: s.nonEmptyString("Freshdesk predefined ticket filter to apply."),
      requesterId: s.positiveInteger("Freshdesk requester identifier to filter tickets by."),
      email: s.email("Requester email address used to filter Freshdesk tickets."),
      companyId: s.positiveInteger("Freshdesk company identifier used to filter tickets by."),
      updatedSince: s.dateTime("ISO 8601 timestamp used as the updated_since Freshdesk filter."),
      orderBy: s.nonEmptyString("Freshdesk ticket field used for ordering results."),
      orderType: s.stringEnum("Freshdesk ticket list ordering direction.", ["asc", "desc"]),
      page: paginationPageSchema,
      perPage: paginationPerPageSchema,
      include: ticketIncludeSchema,
    },
    {
      optional: [
        "filter",
        "requesterId",
        "email",
        "companyId",
        "updatedSince",
        "orderBy",
        "orderType",
        "page",
        "perPage",
        "include",
      ],
    },
  ),
  not: {
    anyOf: [
      { required: ["filter", "requesterId"] },
      { required: ["filter", "email"] },
      { required: ["filter", "companyId"] },
      { required: ["filter", "updatedSince"] },
      { required: ["requesterId", "email"] },
      { required: ["requesterId", "companyId"] },
      { required: ["requesterId", "updatedSince"] },
      { required: ["email", "companyId"] },
      { required: ["email", "updatedSince"] },
      { required: ["companyId", "updatedSince"] },
    ],
  },
};

const ticketSchema = s.looseObject("Freshdesk ticket payload.");

const listTicketsOutputSchema = s.requiredObject("Freshdesk ticket list response wrapper.", {
  tickets: s.array("Freshdesk tickets returned for the current page.", ticketSchema),
  hasMore: s.boolean("Whether another Freshdesk page is likely available."),
  nextPage: s.nullable(s.positiveInteger("Next Freshdesk page number when another page is available.")),
});

const getTicketInputSchema = s.object(
  "Input parameters for reading a single Freshdesk ticket.",
  {
    ticketId: s.positiveInteger("Freshdesk ticket identifier."),
    include: ticketIncludeSchema,
  },
  { optional: ["include"] },
);

const getTicketOutputSchema = s.requiredObject("Freshdesk single ticket response wrapper.", {
  ticket: s.looseObject("Freshdesk ticket details."),
});

const conversationSchema = s.looseObject("Freshdesk ticket conversation payload.");

const listTicketConversationsInputSchema = s.object(
  "Input parameters for listing Freshdesk ticket conversations.",
  {
    ticketId: s.positiveInteger("Freshdesk ticket identifier."),
    page: paginationPageSchema,
    perPage: paginationPerPageSchema,
  },
  { optional: ["page", "perPage"] },
);

const listTicketConversationsOutputSchema = s.requiredObject("Freshdesk ticket conversation list response wrapper.", {
  conversations: s.array("Freshdesk conversations associated with the requested ticket.", conversationSchema),
});

export const freshdeskActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get Freshdesk account details for the current API key.",
    requiredScopes: [],
    inputSchema: accountInputSchema,
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tickets",
    description: "List Freshdesk tickets with optional filters and include expansions.",
    requiredScopes: [],
    inputSchema: listTicketsInputSchema,
    outputSchema: listTicketsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    description: "Get a single Freshdesk ticket by identifier.",
    requiredScopes: [],
    inputSchema: getTicketInputSchema,
    outputSchema: getTicketOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_ticket_conversations",
    description: "List conversations attached to a Freshdesk ticket.",
    requiredScopes: [],
    inputSchema: listTicketConversationsInputSchema,
    outputSchema: listTicketConversationsOutputSchema,
  }),
];
