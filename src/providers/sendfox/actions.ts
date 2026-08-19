import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sendfox" as const;

const contactIdSchema = s.positiveInteger("SendFox contact ID.");
const listIdSchema = s.positiveInteger("SendFox list ID.");

const paginationMetaSchema = s.object("Pagination metadata returned by SendFox list endpoints.", {
  current_page: s.integer("Current result page returned by SendFox."),
  total: s.integer("Total number of records available for the current query."),
  per_page: s.integer("Maximum number of records returned on each page."),
});

const contactFieldValueSchema = s.object("Custom contact field value accepted by SendFox contact write endpoints.", {
  name: s.string("Machine-readable SendFox contact field name.", { minLength: 1 }),
  value: s.nullable(s.string("Custom field value to store on the contact.")),
});

const contactSchema = s.looseRequiredObject("Contact object returned by SendFox.", {
  id: s.integer("SendFox contact ID."),
  email: s.email("Contact email address."),
  first_name: s.nullable(s.string("Contact first name.")),
  last_name: s.nullable(s.string("Contact last name.")),
  ip_address: s.nullable(s.string("IP address associated with the contact.")),
  unsubscribed_at: s.nullable(s.dateTime("Timestamp when the contact unsubscribed.")),
  created_at: s.dateTime("Timestamp when the contact was created."),
  updated_at: s.dateTime("Timestamp when the contact was last updated."),
});

const listSchema = s.looseRequiredObject("Contact list object returned by SendFox.", {
  id: s.integer("SendFox contact list ID."),
  name: s.string("Contact list name."),
  user_id: s.integer("SendFox user ID that owns the list."),
  average_email_open_percent: s.number("Average email open percentage for this list."),
  average_email_click_percent: s.number("Average email click percentage for this list."),
  created_at: s.dateTime("Timestamp when the list was created."),
  updated_at: s.dateTime("Timestamp when the list was last updated."),
});

const messageOutputSchema = s.object("Message response returned by SendFox.", {
  message: s.string("Human-readable SendFox response message."),
});

const contactListOutputSchema = s.object("Paginated contacts returned by SendFox.", {
  contacts: s.array("Contacts returned for the current page.", contactSchema),
  meta: paginationMetaSchema,
});

const listListOutputSchema = s.object("Paginated contact lists returned by SendFox.", {
  lists: s.array("Contact lists returned for the current page.", listSchema),
  meta: paginationMetaSchema,
});

const listContactsInputSchema = s.object(
  "Query parameters for listing SendFox contacts.",
  {
    query: s.string("Search query for filtering contacts.", { minLength: 1 }),
    page: s.positiveInteger("Page number to request from SendFox."),
    unsubscribed: s.boolean("Whether to filter for unsubscribed contacts."),
    email: s.email("Specific contact email address to filter by."),
  },
  { optional: ["query", "page", "unsubscribed", "email"] },
);

const createContactInputSchema = s.object(
  "Request body for creating a SendFox contact.",
  {
    email: s.email("Contact email address."),
    first_name: s.string("Contact first name.", { minLength: 1 }),
    last_name: s.string("Contact last name.", { minLength: 1 }),
    ip_address: s.string("IP address associated with the contact.", { minLength: 1 }),
    lists: s.array("SendFox list IDs to add the contact to.", listIdSchema),
    contact_fields: s.array("Custom contact field values to store on the contact.", contactFieldValueSchema),
  },
  { optional: ["first_name", "last_name", "ip_address", "lists", "contact_fields"] },
);

const contactIdInputSchema = s.object("Path parameters for a SendFox contact endpoint.", {
  contact_id: contactIdSchema,
});

const updateContactInputSchema = s.object(
  "Path parameters and request body for updating a SendFox contact.",
  {
    contact_id: contactIdSchema,
    first_name: s.string("Updated contact first name.", { minLength: 1 }),
    last_name: s.string("Updated contact last name.", { minLength: 1 }),
    lists: s.array("SendFox list IDs that replace the contact's current memberships.", listIdSchema),
    contact_fields: s.array("Custom contact field values to update on the contact.", contactFieldValueSchema),
  },
  { optional: ["first_name", "last_name", "lists", "contact_fields"] },
);

const unsubscribeContactInputSchema = s.object("Request body for unsubscribing a contact.", {
  email: s.email("Contact email address to unsubscribe."),
});

const listListsInputSchema = s.object(
  "Query parameters for listing SendFox contact lists.",
  {
    query: s.string("Search query for filtering contact lists.", { minLength: 1 }),
    page: s.positiveInteger("Page number to request from SendFox."),
  },
  { optional: ["query", "page"] },
);

const createListInputSchema = s.object("Request body for creating a SendFox contact list.", {
  name: s.string("Contact list name.", { minLength: 1 }),
});

const listIdInputSchema = s.object("Path parameters for a SendFox contact list endpoint.", {
  list_id: listIdSchema,
});

const updateListInputSchema = s.object("Path parameters and request body for updating a SendFox contact list.", {
  list_id: listIdSchema,
  name: s.string("Updated contact list name.", { minLength: 1, maxLength: 191 }),
});

const listContactsInListInputSchema = s.object(
  "Path and query parameters for listing contacts in a SendFox list.",
  {
    list_id: listIdSchema,
    query: s.string("Search query for filtering contacts in the list.", { minLength: 1 }),
    page: s.positiveInteger("Page number to request from SendFox."),
  },
  { optional: ["query", "page"] },
);

const listMembershipInputSchema = s.object("Path parameters and body for adding a contact to a SendFox list.", {
  list_id: listIdSchema,
  contact_id: contactIdSchema,
});

export const sendfoxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List SendFox contacts with optional search, email, and unsubscribe filters.",
    requiredScopes: [],
    inputSchema: listContactsInputSchema,
    outputSchema: contactListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a SendFox contact and optionally attach it to lists with custom contact fields.",
    requiredScopes: [],
    inputSchema: createContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get a SendFox contact by ID.",
    requiredScopes: [],
    inputSchema: contactIdInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a SendFox contact's name, list memberships, or custom field values.",
    requiredScopes: [],
    inputSchema: updateContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Soft-delete a SendFox contact and cancel any scheduled deliverables.",
    requiredScopes: [],
    inputSchema: contactIdInputSchema,
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "unsubscribe_contact",
    description: "Unsubscribe a SendFox contact by email address.",
    requiredScopes: [],
    inputSchema: unsubscribeContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "list_contact_lists",
    description: "List SendFox contact lists with optional search filtering.",
    requiredScopes: [],
    inputSchema: listListsInputSchema,
    outputSchema: listListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact_list",
    description: "Create a SendFox contact list.",
    requiredScopes: [],
    inputSchema: createListInputSchema,
    outputSchema: listSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact_list",
    description: "Get a SendFox contact list by ID.",
    requiredScopes: [],
    inputSchema: listIdInputSchema,
    outputSchema: listSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact_list",
    description: "Update a SendFox contact list name.",
    requiredScopes: [],
    inputSchema: updateListInputSchema,
    outputSchema: listSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact_list",
    description: "Soft-delete a SendFox contact list when it is not used by dependent resources.",
    requiredScopes: [],
    inputSchema: listIdInputSchema,
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts_in_list",
    description: "List contacts in a SendFox contact list with optional search filtering.",
    requiredScopes: [],
    inputSchema: listContactsInListInputSchema,
    outputSchema: contactListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_contact_to_list",
    description: "Add an existing SendFox contact to a contact list.",
    requiredScopes: [],
    inputSchema: listMembershipInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "remove_contact_from_list",
    description: "Remove a SendFox contact from a contact list.",
    requiredScopes: [],
    inputSchema: listMembershipInputSchema,
    outputSchema: contactSchema,
  }),
];
