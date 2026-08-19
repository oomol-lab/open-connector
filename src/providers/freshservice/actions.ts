import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "freshservice";

const paginationPageSchema = s.positiveInteger("Page number for the Freshservice list request.");
const paginationPerPageSchema = s.integer("Maximum number of records to return per Freshservice page.", {
  minimum: 1,
  maximum: 100,
});

const freshserviceTicketIncludeItemSchema = s.stringEnum(
  "A Freshservice include token used to embed related ticket details in the response.",
  [
    "conversations",
    "requester",
    "requested_for",
    "stats",
    "problem",
    "assets",
    "changes",
    "related_tickets",
    "onboarding_context",
    "offboarding_context",
    "journey_requests",
    "journey_data",
  ],
);

const freshserviceTicketIncludeSchema = s.array(
  "Freshservice include tokens to expand related records in ticket responses.",
  freshserviceTicketIncludeItemSchema,
  { minItems: 1 },
);

const workspaceIdSchema = s.integer("Workspace identifier used for MSP or multi-workspace Freshservice accounts.", {
  minimum: 1,
});

const freshserviceTicketListInputSchema: JsonSchema = {
  ...s.object(
    "Input parameters for listing Freshservice tickets.",
    {
      page: paginationPageSchema,
      perPage: paginationPerPageSchema,
      filter: s.stringEnum("Freshservice predefined ticket filter to apply.", [
        "new_and_my_open",
        "watching",
        "spam",
        "deleted",
      ]),
      include: freshserviceTicketIncludeSchema,
      orderBy: s.nonEmptyString("Freshservice ticket field used for ordering results."),
      orderType: s.stringEnum("Freshservice ticket list ordering direction.", ["asc", "desc"]),
      updatedSince: s.dateTime("ISO 8601 timestamp used as the updated_since Freshservice filter."),
      workspaceId: workspaceIdSchema,
    },
    {
      optional: ["page", "perPage", "filter", "include", "orderBy", "orderType", "updatedSince", "workspaceId"],
    },
  ),
  dependentRequired: {
    orderType: ["orderBy"],
  },
};

const freshserviceTicketSchema = s.looseObject("A Freshservice ticket object.");

const freshserviceTicketListOutputSchema = s.requiredObject("Freshservice ticket list response wrapper.", {
  tickets: s.array("Freshservice tickets returned for the current page.", freshserviceTicketSchema),
  hasMore: s.boolean("Whether another Freshservice page is likely available."),
  nextPage: s.nullable(s.positiveInteger("The next Freshservice page number when another page is available.")),
});

const freshserviceGetTicketInputSchema = s.object(
  "Input parameters for reading a single Freshservice ticket.",
  {
    ticketId: s.positiveInteger("Freshservice ticket identifier or display identifier."),
    include: freshserviceTicketIncludeSchema,
    workspaceId: workspaceIdSchema,
  },
  { optional: ["include", "workspaceId"] },
);

const freshserviceGetTicketOutputSchema = s.requiredObject("Freshservice single ticket response wrapper.", {
  ticket: freshserviceTicketSchema,
});

const freshserviceCreateTicketInputSchema: JsonSchema = {
  ...s.object(
    "Input parameters for creating a Freshservice ticket.",
    {
      subject: s.nonEmptyString("Subject of the Freshservice ticket."),
      description: s.nonEmptyString("HTML description of the Freshservice ticket."),
      status: s.integer(
        "Freshservice ticket status value. Common defaults are 2=open, 3=pending, 4=resolved, and 5=closed.",
        { minimum: 1 },
      ),
      priority: s.integer(
        "Freshservice ticket priority value. Common defaults are 1=low, 2=medium, 3=high, and 4=urgent.",
        { minimum: 1, maximum: 4 },
      ),
      email: s.email("Requester email address used to create the Freshservice ticket."),
      requesterId: s.positiveInteger("Requester identifier used when the requester already exists in Freshservice."),
      name: s.nonEmptyString("Requester name used when creating a new contact from the ticket."),
      type: s.stringEnum("Freshservice ticket type.", ["Incident", "Service Request"]),
      source: s.integer(
        "Freshservice ticket source value. Common values include 1=email, 2=portal, 3=phone, 7=chat, 8=feedback widget, and 9=outbound email.",
        { minimum: 1 },
      ),
      impact: s.integer("Freshservice ticket impact value. Common defaults are 1=low, 2=medium, and 3=high.", {
        minimum: 1,
        maximum: 3,
      }),
      urgency: s.integer(
        "Freshservice ticket urgency value. Common defaults are 1=low, 2=medium, 3=high, and 4=critical.",
        { minimum: 1, maximum: 4 },
      ),
      emailConfigId: s.positiveInteger(
        "Freshservice email configuration identifier used for outbound email ticket creation.",
      ),
      groupId: s.positiveInteger("Support group identifier assigned to the ticket."),
      responderId: s.positiveInteger("Agent identifier assigned to the ticket."),
      requestedForId: s.positiveInteger("Identifier of the user on whose behalf the request is raised."),
      departmentId: s.positiveInteger("Department identifier assigned to the ticket."),
      category: s.nonEmptyString("Category value assigned to the ticket."),
      subCategory: s.nonEmptyString("Sub-category value assigned to the ticket."),
      itemCategory: s.nonEmptyString("Item category value assigned to the ticket."),
      dueBy: s.dateTime("SLA due-by timestamp in ISO 8601 format."),
      frDueBy: s.dateTime("First-response due-by timestamp in ISO 8601 format."),
      tags: s.stringArray("Tags to attach to the Freshservice ticket.", {
        minItems: 1,
        itemDescription: "A Freshservice tag.",
      }),
      ccEmails: s.array("CC email addresses added to an outbound email ticket.", s.email("A CC email address."), {
        minItems: 1,
      }),
      customFields: s.record(
        "Freshservice custom field values keyed by upstream field name.",
        s.unknown("One Freshservice custom field value."),
      ),
      workspaceId: workspaceIdSchema,
    },
    {
      optional: [
        "email",
        "requesterId",
        "name",
        "type",
        "source",
        "impact",
        "urgency",
        "emailConfigId",
        "groupId",
        "responderId",
        "requestedForId",
        "departmentId",
        "category",
        "subCategory",
        "itemCategory",
        "dueBy",
        "frDueBy",
        "tags",
        "ccEmails",
        "customFields",
        "workspaceId",
      ],
    },
  ),
  anyOf: [{ required: ["email"] }, { required: ["requesterId"] }],
};

const freshserviceCreateTicketOutputSchema = s.requiredObject("Freshservice create ticket response wrapper.", {
  ticket: freshserviceTicketSchema,
});

const freshserviceListLocationsInputSchema = s.object(
  "Input parameters for listing Freshservice locations.",
  {
    page: paginationPageSchema,
    perPage: paginationPerPageSchema,
    workspaceId: workspaceIdSchema,
  },
  { optional: ["page", "perPage", "workspaceId"] },
);

const freshserviceLocationSchema = s.looseObject("A Freshservice location object.");

const freshserviceListLocationsOutputSchema = s.requiredObject("Freshservice locations response wrapper.", {
  locations: s.array("Freshservice locations returned for the current page.", freshserviceLocationSchema),
  hasMore: s.boolean("Whether another Freshservice locations page is likely available."),
  nextPage: s.nullable(s.positiveInteger("The next Freshservice locations page number when available.")),
});

const freshserviceListServiceCatalogItemsInputSchema = s.object(
  "Input parameters for listing Freshservice service catalog items.",
  {
    page: paginationPageSchema,
    perPage: paginationPerPageSchema,
    searchTerm: s.nonEmptyString("Optional search term used to search Freshservice service catalog items."),
    workspaceId: workspaceIdSchema,
  },
  { optional: ["page", "perPage", "searchTerm", "workspaceId"] },
);

const freshserviceServiceCatalogItemSchema = s.looseObject("A Freshservice service catalog item object.");

const freshserviceListServiceCatalogItemsOutputSchema = s.requiredObject(
  "Freshservice service catalog list response wrapper.",
  {
    items: s.array(
      "Freshservice service catalog items returned for the current page.",
      freshserviceServiceCatalogItemSchema,
    ),
    hasMore: s.boolean("Whether another Freshservice service catalog page is likely available."),
    nextPage: s.nullable(s.positiveInteger("The next Freshservice service catalog page number when available.")),
  },
);

const freshserviceCustomFieldValueSchema = s.anyOf("One Freshservice service item custom field value.", [
  s.string("A string custom field value."),
  s.integer("An integer custom field value."),
  s.boolean("A boolean custom field value."),
  s.number("A numeric custom field value."),
]);

const freshserviceCreateServiceRequestInputSchema = s.object(
  "Input parameters for creating a Freshservice service request from one catalog item.",
  {
    itemDisplayId: s.positiveInteger("Display ID of the Freshservice service catalog item to request."),
    email: s.email("Requester email address used for the Freshservice service request."),
    quantity: s.positiveInteger("Quantity of the requested catalog item."),
    parentTicketId: s.positiveInteger(
      "Parent Freshservice ticket display ID used when creating a child service request.",
    ),
    workspaceId: workspaceIdSchema,
    customFields: s.record(
      "Freshservice service item custom field values keyed by upstream field name.",
      freshserviceCustomFieldValueSchema,
    ),
  },
  { optional: ["email", "quantity", "parentTicketId", "workspaceId", "customFields"] },
);

const freshserviceServiceRequestSchema = s.looseObject("A Freshservice service request object.");

const freshserviceCreateServiceRequestOutputSchema = s.requiredObject(
  "Freshservice create service request response wrapper.",
  {
    serviceRequest: freshserviceServiceRequestSchema,
  },
);

export const freshserviceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tickets",
    description: "List Freshservice tickets with optional filters, pagination, and include expansions.",
    requiredScopes: [],
    inputSchema: freshserviceTicketListInputSchema,
    outputSchema: freshserviceTicketListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    description: "Get one Freshservice ticket by identifier with optional include expansions.",
    requiredScopes: [],
    inputSchema: freshserviceGetTicketInputSchema,
    outputSchema: freshserviceGetTicketOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_ticket",
    description: "Create a Freshservice ticket for an incident or service request workflow.",
    requiredScopes: [],
    inputSchema: freshserviceCreateTicketInputSchema,
    outputSchema: freshserviceCreateTicketOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List Freshservice locations to help callers resolve account-level location metadata.",
    requiredScopes: [],
    inputSchema: freshserviceListLocationsInputSchema,
    outputSchema: freshserviceListLocationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_service_catalog_items",
    description:
      "List Freshservice service catalog items so callers can discover item display IDs before placing requests.",
    requiredScopes: [],
    inputSchema: freshserviceListServiceCatalogItemsInputSchema,
    outputSchema: freshserviceListServiceCatalogItemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_service_request",
    description: "Create a Freshservice service request for one service catalog item.",
    requiredScopes: [],
    inputSchema: freshserviceCreateServiceRequestInputSchema,
    outputSchema: freshserviceCreateServiceRequestOutputSchema,
  }),
];
