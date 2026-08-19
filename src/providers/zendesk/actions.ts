import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { zendeskReadScope, zendeskReadScopes, zendeskWriteScope, zendeskWriteScopes } from "./scopes.ts";

const service = "zendesk";

const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });
const nullableString = (description: string) => s.nullableString(description);
const rawObject = s.looseObject("Additional Zendesk object fields.");
const tagArray = s.array("Zendesk tag values.", s.string("Zendesk tag value."));
const paginationSchema = s.object("Normalized pagination metadata returned by Zendesk.", {
  count: s.nullableInteger("Total count reported by Zendesk, or null when the endpoint does not provide it."),
  hasMore: s.boolean("Whether Zendesk indicates that more records are available."),
  nextPage: nullableString("URL for the next Zendesk page, or null when there is no next page."),
  previousPage: nullableString("URL for the previous Zendesk page, or null when there is no previous page."),
  afterCursor: nullableString("Cursor for the next page, or null when cursor pagination is not in use."),
  beforeCursor: nullableString("Cursor for the previous page, or null when cursor pagination is not in use."),
});
const ticketSchema = s.looseObject("Normalized Zendesk ticket.", {
  id: positiveInteger("Zendesk ticket identifier."),
  url: nullableString("API URL of the ticket, or null when Zendesk omits it."),
  subject: nullableString("Ticket subject, or null when Zendesk omits it."),
  description: nullableString("Ticket description, or null when Zendesk omits it."),
  requesterId: s.nullableInteger("Requester identifier, or null when Zendesk omits it."),
  tags: tagArray,
  raw: rawObject,
});
const userSchema = s.looseObject("Normalized Zendesk user.", {
  id: positiveInteger("Zendesk user identifier."),
  name: nullableString("User display name, or null when Zendesk omits it."),
  email: nullableString("User primary email, or null when Zendesk omits it."),
  role: nullableString("Zendesk role string, or null when Zendesk omits it."),
  raw: rawObject,
});
const organizationSchema = s.looseObject("Normalized Zendesk organization.", {
  id: positiveInteger("Zendesk organization identifier."),
  name: nullableString("Organization name, or null when Zendesk omits it."),
  raw: rawObject,
});
const commentSchema = s.looseObject("Normalized Zendesk ticket comment.", {
  id: positiveInteger("Zendesk ticket comment identifier."),
  body: nullableString("Plain-text comment body, or null when Zendesk omits it."),
  htmlBody: nullableString("HTML comment body, or null when Zendesk omits it."),
  raw: rawObject,
});
const pageFields = {
  page: s.integer("Offset pagination page number.", { minimum: 1 }),
  perPage: s.integer("Maximum records to return for offset pagination.", { minimum: 1, maximum: 100 }),
  pageSize: s.integer("Maximum records to return for cursor pagination.", { minimum: 1, maximum: 100 }),
  pageAfter: s.string("Opaque cursor returned by the previous Zendesk page."),
  pageBefore: s.string("Opaque cursor for retrieving the previous Zendesk page."),
};
const ticketMutationFields = {
  subject: s.string("Ticket subject line."),
  description: s.string("Plain-text body used for the initial or appended ticket comment."),
  htmlDescription: s.string("HTML body used for the initial or appended ticket comment."),
  commentPublic: s.boolean("Whether the generated comment is public when a comment is included."),
  status: s.stringEnum("Zendesk ticket status accepted by update operations.", [
    "new",
    "open",
    "pending",
    "hold",
    "solved",
  ]),
  priority: s.stringEnum("Zendesk ticket priority.", ["urgent", "high", "normal", "low"]),
  ticketType: s.stringEnum("Zendesk ticket type.", ["problem", "incident", "question", "task"]),
  assigneeId: positiveInteger("Agent identifier assigned to the ticket."),
  groupId: positiveInteger("Group identifier assigned to the ticket."),
  organizationId: positiveInteger("Organization identifier for the ticket."),
  requesterId: positiveInteger("Existing requester identifier."),
  externalId: s.string("External identifier linked to the ticket."),
  dueAt: s.dateTime("Task due timestamp in ISO 8601 format."),
  tags: tagArray,
  customFields: s.array(
    "Custom field values applied to the ticket.",
    s.object("Zendesk custom field update.", {
      id: positiveInteger("Zendesk custom field identifier."),
      value: s.unknown("Value assigned to the custom field."),
    }),
  ),
};

export const zendeskActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current authenticated Zendesk user.",
    requiredScopes: zendeskReadScopes,
    providerPermissions: [zendeskReadScope],
    inputSchema: s.object("Input parameters for reading the current Zendesk user.", {}),
    outputSchema: s.object("Zendesk current user response wrapper.", { user: userSchema }),
  }),
  defineProviderAction(service, {
    name: "list_tickets",
    description: "List Zendesk tickets with offset or cursor pagination.",
    requiredScopes: zendeskReadScopes,
    providerPermissions: [zendeskReadScope],
    inputSchema: s.object(
      "Input parameters for listing Zendesk tickets.",
      {
        ...pageFields,
        externalId: s.string("External identifier used to filter tickets."),
        sortBy: s.string("Zendesk field used to sort tickets."),
        sortOrder: s.stringEnum("Zendesk sort direction.", ["asc", "desc"]),
      },
      { optional: ["page", "perPage", "pageSize", "pageAfter", "pageBefore", "externalId", "sortBy", "sortOrder"] },
    ),
    outputSchema: s.object("Zendesk ticket list response wrapper.", {
      tickets: s.array("Tickets returned by Zendesk.", ticketSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    description: "Get a Zendesk ticket and its comments by identifier.",
    requiredScopes: zendeskReadScopes,
    providerPermissions: [zendeskReadScope],
    followUpActions: ["zendesk.reply_to_ticket"],
    inputSchema: s.object("Input parameters for reading a single Zendesk ticket.", {
      ticketId: positiveInteger("Zendesk ticket identifier."),
    }),
    outputSchema: s.object("Zendesk ticket detail response wrapper.", {
      ticket: ticketSchema,
      comments: s.array("Comments attached to the ticket.", commentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_ticket",
    description: "Create a Zendesk ticket with an initial comment.",
    requiredScopes: zendeskWriteScopes,
    providerPermissions: [zendeskWriteScope],
    followUpActions: ["zendesk.get_ticket"],
    inputSchema: s.object(
      "Input parameters for creating a Zendesk ticket.",
      {
        ...ticketMutationFields,
        requester: s.object(
          "Requester object used when creating a ticket.",
          {
            name: s.string("Requester display name."),
            email: s.email("Requester email address."),
          },
          { optional: ["name"] },
        ),
      },
      {
        optional: [
          "description",
          "htmlDescription",
          "commentPublic",
          "status",
          "priority",
          "ticketType",
          "assigneeId",
          "groupId",
          "organizationId",
          "requesterId",
          "requester",
          "externalId",
          "dueAt",
          "tags",
          "customFields",
        ],
      },
    ),
    outputSchema: s.object("Zendesk ticket mutation response wrapper.", { ticket: ticketSchema }),
  }),
  defineProviderAction(service, {
    name: "update_ticket",
    description: "Update fields on an existing Zendesk ticket.",
    requiredScopes: zendeskWriteScopes,
    providerPermissions: [zendeskWriteScope],
    inputSchema: s.object(
      "Input parameters for updating a Zendesk ticket.",
      {
        ticketId: positiveInteger("Zendesk ticket identifier."),
        ...ticketMutationFields,
        safeUpdate: s.boolean("Whether to enable optimistic locking for ticket updates."),
        updatedStamp: s.dateTime("Last known ticket updated_at timestamp used with safeUpdate."),
        metadata: rawObject,
      },
      {
        optional: [
          "subject",
          "description",
          "htmlDescription",
          "commentPublic",
          "status",
          "priority",
          "ticketType",
          "assigneeId",
          "groupId",
          "organizationId",
          "requesterId",
          "externalId",
          "dueAt",
          "tags",
          "customFields",
          "safeUpdate",
          "updatedStamp",
          "metadata",
        ],
      },
    ),
    outputSchema: s.object("Zendesk ticket mutation response wrapper.", { ticket: ticketSchema }),
  }),
  defineProviderAction(service, {
    name: "reply_to_ticket",
    description: "Append a public reply or internal note to a Zendesk ticket.",
    requiredScopes: zendeskWriteScopes,
    providerPermissions: [zendeskWriteScope],
    inputSchema: s.object(
      "Input parameters for replying to a Zendesk ticket.",
      {
        ticketId: positiveInteger("Zendesk ticket identifier."),
        body: s.nonEmptyString("Comment body to append to the ticket."),
        public: s.boolean("Whether the appended comment is public. Defaults to true."),
        assigneeId: positiveInteger("Agent identifier assigned together with the reply."),
      },
      { optional: ["public", "assigneeId"] },
    ),
    outputSchema: s.object("Zendesk ticket mutation response wrapper.", { ticket: ticketSchema }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Zendesk users with optional role and pagination filters.",
    requiredScopes: zendeskReadScopes,
    providerPermissions: [zendeskReadScope],
    inputSchema: s.object(
      "Input parameters for listing Zendesk users.",
      {
        ...pageFields,
        role: s.stringEnum("Zendesk user role.", ["end-user", "agent", "admin"]),
        roleList: s.array(
          "Roles included in the user filter.",
          s.stringEnum("User role included in the filter.", ["end-user", "agent", "admin"]),
        ),
        externalId: s.string("External identifier used to filter users."),
        permissionSet: positiveInteger("Zendesk custom role identifier."),
      },
      {
        optional: [
          "page",
          "perPage",
          "pageSize",
          "pageAfter",
          "pageBefore",
          "role",
          "roleList",
          "externalId",
          "permissionSet",
        ],
      },
    ),
    outputSchema: s.object("Zendesk user list response wrapper.", {
      users: s.array("Users returned by Zendesk.", userSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a Zendesk user by identifier.",
    requiredScopes: zendeskReadScopes,
    providerPermissions: [zendeskReadScope],
    inputSchema: s.object("Input parameters for reading a single Zendesk user.", {
      userId: positiveInteger("Zendesk user identifier."),
    }),
    outputSchema: s.object("Zendesk single user response wrapper.", { user: userSchema }),
  }),
  defineProviderAction(service, {
    name: "search_users",
    description: "Search Zendesk users by email address or name.",
    requiredScopes: zendeskReadScopes,
    providerPermissions: [zendeskReadScope],
    inputSchema: s.object(
      "Input parameters for searching Zendesk users.",
      {
        email: s.email("User email used for the Zendesk search."),
        name: s.string("User name fragment used for the Zendesk search."),
        page: pageFields.page,
        perPage: pageFields.perPage,
      },
      { optional: ["email", "name", "page", "perPage"] },
    ),
    outputSchema: s.object("Zendesk user search response wrapper.", {
      users: s.array("Users returned by the search.", userSchema),
      count: s.integer("Total number of matching users."),
      nextPage: nullableString("URL for the next Zendesk page, or null when there is no next page."),
      previousPage: nullableString("URL for the previous Zendesk page, or null when there is no previous page."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List Zendesk organizations with pagination.",
    requiredScopes: zendeskReadScopes,
    providerPermissions: [zendeskReadScope],
    inputSchema: s.object(
      "Input parameters for listing Zendesk organizations.",
      {
        page: pageFields.page,
        perPage: pageFields.perPage,
      },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: s.object("Zendesk organization list response wrapper.", {
      organizations: s.array("Organizations returned by Zendesk.", organizationSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get a Zendesk organization by identifier.",
    requiredScopes: zendeskReadScopes,
    providerPermissions: [zendeskReadScope],
    inputSchema: s.object("Input parameters for reading a single Zendesk organization.", {
      organizationId: positiveInteger("Zendesk organization identifier."),
    }),
    outputSchema: s.object("Zendesk single organization response wrapper.", { organization: organizationSchema }),
  }),
];
