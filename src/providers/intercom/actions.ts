import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { intercomPermissionLabels } from "./scopes.ts";

const service = "intercom";

const looseObjectSchema = s.looseObject("Intercom object payload.");
const unknownRecordSchema = s.record("Intercom key-value object.", s.unknown("An Intercom field value."));

const optionalCursorField = s.string("Opaque Intercom cursor returned from a previous paginated response.", {
  minLength: 1,
});
const optionalPerPageField = s.integer("Maximum number of Intercom records to return.", {
  minimum: 1,
  maximum: 150,
});
const optionalPageField = s.integer("One-based Intercom page number to fetch.", { minimum: 1 });
const paginationSchema = s.object("Normalized Intercom cursor pagination metadata.", {
  hasMore: s.boolean("Whether Intercom reported another page of results."),
  nextStartingAfter: s.nullable(s.string("Cursor for the next Intercom page, or null when there is no next page.")),
  page: s.nullable(s.integer("Current page number reported by Intercom, or null when omitted.")),
  perPage: s.nullable(s.integer("Current page size reported by Intercom, or null when omitted.")),
  totalPages: s.nullable(s.integer("Total Intercom pages reported by the endpoint, or null when omitted.")),
  totalCount: s.nullable(s.integer("Total Intercom record count reported by the endpoint, or null when omitted.")),
});

const adminSchema = { ...looseObjectSchema, description: "Intercom admin payload." };
const contactSchema = { ...looseObjectSchema, description: "Intercom contact payload." };
const companySchema = { ...looseObjectSchema, description: "Intercom company payload." };
const conversationSchema = { ...looseObjectSchema, description: "Intercom conversation payload." };
const ticketSchema = { ...looseObjectSchema, description: "Intercom ticket payload." };
const articleSchema = { ...looseObjectSchema, description: "Intercom article payload." };

const listAdminsInputSchema = s.object(
  "Input parameters for listing Intercom admins.",
  {
    displayAvatar: s.boolean("Whether Intercom should include admin avatar objects in the response."),
  },
  { optional: ["displayAvatar"] },
);

const getCurrentAdminInputSchema = s.object(
  "Input parameters for reading the currently authorized Intercom admin.",
  {},
);

const adminIdField = s.union(
  [s.string("Intercom admin identifier.", { minLength: 1 }), s.nonNegativeInteger("Intercom admin identifier.")],
  { description: "Intercom admin identifier." },
);
const pathTokenField = s.union(
  [s.string("Intercom resource identifier.", { minLength: 1 }), s.nonNegativeInteger("Intercom resource identifier.")],
  { description: "Intercom resource identifier." },
);

const getAdminInputSchema = s.object("Input parameters for reading a single Intercom admin.", {
  adminId: adminIdField,
});

const listContactsInputSchema = s.object(
  "Input parameters for listing Intercom contacts.",
  {
    perPage: optionalPerPageField,
    startingAfter: optionalCursorField,
  },
  { optional: ["perPage", "startingAfter"] },
);

const searchContactsInputSchema = s.object(
  "Input parameters for searching Intercom contacts.",
  {
    query: unknownRecordSchema,
    perPage: optionalPerPageField,
    startingAfter: optionalCursorField,
  },
  { optional: ["perPage", "startingAfter"] },
);

const contactIdField = s.string("Intercom contact identifier.", { minLength: 1 });
const externalIdField = s.string("External identifier stored on the Intercom contact.", { minLength: 1 });

const getContactInputSchema = s.object("Input parameters for reading a single Intercom contact.", {
  contactId: contactIdField,
});

const getContactByExternalIdInputSchema = s.object(
  "Input parameters for reading a single Intercom contact by external ID.",
  {
    externalId: externalIdField,
  },
);

const contactWriteFields: Record<string, JsonSchema> = {
  role: s.stringEnum("Intercom contact role.", ["user", "lead"]),
  externalId: externalIdField,
  email: s.email("Primary email address for the Intercom contact."),
  phone: s.nullable(s.string("Phone number for the Intercom contact.", { minLength: 1 })),
  name: s.nullable(s.string("Display name for the Intercom contact.", { minLength: 1 })),
  avatar: s.nullable(s.url("Avatar image URL for the Intercom contact.")),
  signedUpAt: s.nullable(s.nonNegativeInteger("UNIX timestamp when the contact signed up.")),
  lastSeenAt: s.nullable(s.nonNegativeInteger("UNIX timestamp when the contact was last seen.")),
  ownerId: s.nullable(adminIdField),
  unsubscribedFromEmails: s.nullable(s.boolean("Whether the contact is unsubscribed from emails.")),
  customAttributes: s.nullable(unknownRecordSchema),
};
const contactWriteFieldNames = Object.keys(contactWriteFields);

const createContactInputSchema = s.object(
  "Input parameters for creating an Intercom contact. At least one of email, externalId, or role is required.",
  contactWriteFields,
  { optional: contactWriteFieldNames },
);

const updateContactInputSchema = s.object(
  "Input parameters for updating an Intercom contact. At least one field besides contactId must be provided.",
  {
    contactId: contactIdField,
    ...contactWriteFields,
  },
  { optional: contactWriteFieldNames },
);

const listCompaniesInputSchema = s.object(
  "Input parameters for listing Intercom companies.",
  {
    page: optionalPageField,
    perPage: optionalPerPageField,
    order: s.stringEnum("Order in which Intercom should return companies.", ["asc", "desc"]),
    startingAfter: optionalCursorField,
  },
  { optional: ["page", "perPage", "order", "startingAfter"] },
);

const getCompanyInputSchema = s.object(
  "Input parameters for reading a single Intercom company. Exactly one of companyId or name is required.",
  {
    companyId: s.string("Company identifier defined by you in Intercom.", { minLength: 1 }),
    name: s.string("Company name to look up in Intercom.", { minLength: 1 }),
  },
  { optional: ["companyId", "name"] },
);

const listConversationsInputSchema = s.object(
  "Input parameters for listing Intercom conversations.",
  {
    perPage: optionalPerPageField,
    startingAfter: optionalCursorField,
  },
  { optional: ["perPage", "startingAfter"] },
);

const conversationIdField = s.string("Intercom conversation identifier.", { minLength: 1 });

const getConversationInputSchema = s.object(
  "Input parameters for reading a single Intercom conversation.",
  {
    conversationId: conversationIdField,
    displayAs: s.stringEnum("How Intercom should render conversation message bodies in the response.", [
      "plaintext",
      "html",
    ]),
  },
  { optional: ["displayAs"] },
);

const replyToConversationInputSchema = s.object(
  "Input parameters for replying to an Intercom conversation as an admin.",
  {
    conversationId: s.string("Intercom conversation identifier, or `last` to target the most recent part.", {
      minLength: 1,
    }),
    adminId: s.string("Intercom admin identifier sending the reply.", { minLength: 1 }),
    body: s.string("Reply body to send to the conversation.", { minLength: 1 }),
    messageType: s.stringEnum("Intercom reply type to create. Defaults to `comment`.", ["comment", "note"]),
    attachmentUrls: s.array(
      "Attachment URLs to include with the reply.",
      s.url("Public attachment URL to include in the reply."),
      { maxItems: 10 },
    ),
  },
  { optional: ["messageType", "attachmentUrls"] },
);

const closeConversationInputSchema = s.object(
  "Input parameters for closing an Intercom conversation.",
  {
    conversationId: conversationIdField,
    adminId: s.string("Intercom admin identifier performing the close.", { minLength: 1 }),
    body: s.string("Optional closing message to append to the conversation.", { minLength: 1 }),
  },
  { optional: ["body"] },
);

const reopenConversationInputSchema = s.object("Input parameters for reopening an Intercom conversation.", {
  conversationId: conversationIdField,
  adminId: s.string("Intercom admin identifier performing the reopen.", { minLength: 1 }),
});

const listEventsInputSchema = s.object(
  "Input parameters for reading Intercom user data events. Exactly one of userId, email, or intercomUserId is required.",
  {
    userId: s.string("User ID used to identify the Intercom user.", { minLength: 1 }),
    email: s.email("Email address used to identify the Intercom user."),
    intercomUserId: s.string("Intercom user or lead identifier.", { minLength: 1 }),
    summary: s.boolean("Whether Intercom should return event summary data."),
    perPage: optionalPerPageField,
  },
  { optional: ["userId", "email", "intercomUserId", "summary", "perPage"] },
);

const listTagsInputSchema = s.actionInput({}, [], "Input parameters for listing Intercom tags.");

const getCountsInputSchema = s.object(
  "Input parameters for reading Intercom counts.",
  {
    type: s.string("Intercom count type to request, such as conversation.", { minLength: 1 }),
    count: s.string("Intercom count grouping to request, such as tag or segment.", { minLength: 1 }),
  },
  { optional: ["type", "count"] },
);

const getTicketInputSchema = s.object("Input parameters for reading a single Intercom ticket.", {
  ticketId: s.string("Internal Intercom ticket identifier.", { minLength: 1 }),
});

const searchTicketsInputSchema = s.object(
  "Input parameters for searching Intercom tickets.",
  {
    query: unknownRecordSchema,
    perPage: optionalPerPageField,
    startingAfter: optionalCursorField,
  },
  { optional: ["perPage", "startingAfter"] },
);

const getJobStatusInputSchema = s.object("Input parameters for reading Intercom job status.", {
  jobId: s.string("Intercom job identifier.", { minLength: 1 }),
});

const listArticlesInputSchema = s.object(
  "Input parameters for listing Intercom articles.",
  {
    perPage: optionalPerPageField,
    startingAfter: optionalCursorField,
  },
  { optional: ["perPage", "startingAfter"] },
);

const getArticleInputSchema = s.object("Input parameters for reading a single Intercom article.", {
  articleId: pathTokenField,
});

const listAdminsOutputSchema = s.object("Intercom admin list response wrapper.", {
  admins: s.array("Intercom admins returned for the current workspace.", adminSchema),
});
const getCurrentAdminOutputSchema = s.object("Intercom current admin response wrapper.", {
  admin: adminSchema,
});
const getAdminOutputSchema = s.object("Intercom single admin response wrapper.", {
  admin: adminSchema,
});
const listContactsOutputSchema = s.object("Intercom contact list response wrapper.", {
  contacts: s.array("Intercom contacts returned for the current page.", contactSchema),
  pagination: paginationSchema,
});
const searchContactsOutputSchema = s.object("Intercom contact search response wrapper.", {
  contacts: s.array("Intercom contacts returned by the search query.", contactSchema),
  pagination: paginationSchema,
});
const getContactOutputSchema = s.object("Intercom single contact response wrapper.", {
  contact: contactSchema,
});
const writeContactOutputSchema = s.object("Intercom contact write response wrapper.", {
  contact: contactSchema,
});
const listCompaniesOutputSchema = s.object("Intercom company list response wrapper.", {
  companies: s.array("Intercom companies returned for the current page.", companySchema),
  pagination: paginationSchema,
});
const getCompanyOutputSchema = s.object("Intercom single company response wrapper.", {
  company: companySchema,
});
const listConversationsOutputSchema = s.object("Intercom conversation list response wrapper.", {
  conversations: s.array("Intercom conversations returned for the current page.", conversationSchema),
  pagination: paginationSchema,
});
const getConversationOutputSchema = s.object("Intercom single conversation response wrapper.", {
  conversation: conversationSchema,
});
const writeConversationOutputSchema = s.object("Intercom conversation write response wrapper.", {
  conversation: conversationSchema,
});
const listEventsOutputSchema = s.object("Intercom user event response wrapper.", {
  events: s.array("Intercom events returned by the endpoint.", s.looseObject("Intercom event.")),
  eventSummary: s.looseObject("Raw Intercom event summary payload."),
});
const listTagsOutputSchema = s.object("Intercom tag list response wrapper.", {
  tags: s.array("Intercom tags returned for the workspace.", s.looseObject("Intercom tag.")),
});
const getCountsOutputSchema = s.object("Intercom counts response wrapper.", {
  counts: s.looseObject("Raw Intercom counts payload."),
});
const getTicketOutputSchema = s.object("Intercom single ticket response wrapper.", {
  ticket: ticketSchema,
});
const searchTicketsOutputSchema = s.object("Intercom ticket search response wrapper.", {
  tickets: s.array("Intercom tickets returned by the search query.", ticketSchema),
  pagination: paginationSchema,
});
const getJobStatusOutputSchema = s.object("Intercom job status response wrapper.", {
  job: s.looseObject("Intercom job status payload."),
});
const listArticlesOutputSchema = s.object("Intercom article list response wrapper.", {
  articles: s.array("Intercom articles returned for the current page.", articleSchema),
  pagination: paginationSchema,
});
const getArticleOutputSchema = s.object("Intercom single article response wrapper.", {
  article: articleSchema,
});

export const intercomActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_admin",
    description: "Get the currently authorized Intercom admin and workspace metadata.",
    requiredScopes: [intercomPermissionLabels.adminsRead],
    inputSchema: getCurrentAdminInputSchema,
    outputSchema: getCurrentAdminOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_admins",
    description: "List Intercom admins for the current workspace.",
    requiredScopes: [intercomPermissionLabels.adminsRead],
    inputSchema: listAdminsInputSchema,
    outputSchema: listAdminsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_admin",
    description: "Get a single Intercom admin by identifier.",
    requiredScopes: [intercomPermissionLabels.adminsRead],
    inputSchema: getAdminInputSchema,
    outputSchema: getAdminOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Intercom contacts with cursor-based pagination.",
    requiredScopes: [intercomPermissionLabels.contactsRead],
    inputSchema: listContactsInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_contacts",
    description: "Search Intercom contacts with the official search DSL.",
    requiredScopes: [intercomPermissionLabels.contactsRead],
    inputSchema: searchContactsInputSchema,
    outputSchema: searchContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get a single Intercom contact by identifier.",
    requiredScopes: [intercomPermissionLabels.contactsRead],
    inputSchema: getContactInputSchema,
    outputSchema: getContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact_by_external_id",
    description: "Get a single Intercom contact by external ID.",
    requiredScopes: [intercomPermissionLabels.contactsRead],
    inputSchema: getContactByExternalIdInputSchema,
    outputSchema: getContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a new Intercom contact.",
    requiredScopes: [intercomPermissionLabels.contactsWrite],
    inputSchema: createContactInputSchema,
    outputSchema: writeContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update an existing Intercom contact.",
    requiredScopes: [intercomPermissionLabels.contactsWrite],
    inputSchema: updateContactInputSchema,
    outputSchema: writeContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_companies",
    description: "List Intercom companies with pagination.",
    requiredScopes: [intercomPermissionLabels.contactsRead],
    inputSchema: listCompaniesInputSchema,
    outputSchema: listCompaniesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Get a single Intercom company by company ID or name.",
    requiredScopes: [intercomPermissionLabels.contactsRead],
    inputSchema: getCompanyInputSchema,
    outputSchema: getCompanyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_conversations",
    description: "List Intercom conversations with cursor-based pagination.",
    requiredScopes: [intercomPermissionLabels.conversationsRead],
    inputSchema: listConversationsInputSchema,
    outputSchema: listConversationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_conversation",
    description: "Get a single Intercom conversation with its conversation parts.",
    requiredScopes: [intercomPermissionLabels.conversationsRead],
    inputSchema: getConversationInputSchema,
    outputSchema: getConversationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reply_to_conversation",
    description: "Reply to an Intercom conversation as an admin.",
    requiredScopes: [intercomPermissionLabels.conversationsWrite],
    inputSchema: replyToConversationInputSchema,
    outputSchema: writeConversationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "close_conversation",
    description: "Close an Intercom conversation.",
    requiredScopes: [intercomPermissionLabels.conversationsWrite],
    inputSchema: closeConversationInputSchema,
    outputSchema: writeConversationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reopen_conversation",
    description: "Reopen an Intercom conversation.",
    requiredScopes: [intercomPermissionLabels.conversationsWrite],
    inputSchema: reopenConversationInputSchema,
    outputSchema: writeConversationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_events",
    description: "List recent Intercom data events for one user or lead.",
    requiredScopes: [intercomPermissionLabels.eventsRead],
    inputSchema: listEventsInputSchema,
    outputSchema: listEventsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List all Intercom tags for the current workspace.",
    requiredScopes: [intercomPermissionLabels.tagsRead],
    inputSchema: listTagsInputSchema,
    outputSchema: listTagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_counts",
    description: "Read Intercom workspace, conversation, or grouped counts.",
    requiredScopes: [intercomPermissionLabels.countsRead],
    inputSchema: getCountsInputSchema,
    outputSchema: getCountsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    description: "Get a single Intercom ticket by internal ticket identifier.",
    requiredScopes: [intercomPermissionLabels.ticketsRead],
    inputSchema: getTicketInputSchema,
    outputSchema: getTicketOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_tickets",
    description: "Search Intercom tickets with the official search DSL.",
    requiredScopes: [intercomPermissionLabels.ticketsRead],
    inputSchema: searchTicketsInputSchema,
    outputSchema: searchTicketsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job_status",
    description: "Get the status of an Intercom asynchronous job.",
    requiredScopes: [intercomPermissionLabels.jobsRead],
    inputSchema: getJobStatusInputSchema,
    outputSchema: getJobStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_articles",
    description: "List Intercom help center articles.",
    requiredScopes: [intercomPermissionLabels.articlesRead],
    inputSchema: listArticlesInputSchema,
    outputSchema: listArticlesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_article",
    description: "Get a single Intercom help center article by identifier.",
    requiredScopes: [intercomPermissionLabels.articlesRead],
    inputSchema: getArticleInputSchema,
    outputSchema: getArticleOutputSchema,
  }),
];
