import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sendmator";

const contactIdSchema = s.string("Sendmator contact ID.", { minLength: 1 });
const contactTagsSchema = s.array(
  "Tags attached to the Sendmator contact.",
  s.string("One Sendmator contact tag.", { minLength: 1 }),
);
const customFieldsSchema = s.record(
  "Custom contact fields keyed by field name.",
  s.unknown("A custom contact field value."),
);
const metadataSchema = s.looseObject("Additional contact metadata returned by Sendmator or provided by the caller.");

const contactSchema = s.looseObject("A Sendmator contact object.", {
  id: s.string("The Sendmator contact ID."),
  external_id: s.string("External contact ID used to map the contact to another system."),
  email: s.email("The contact email address."),
  first_name: s.nullable(s.string("The contact first name, or null when unavailable.")),
  last_name: s.nullable(s.string("The contact last name, or null when unavailable.")),
  tags: contactTagsSchema,
  is_active: s.boolean("Whether the contact is active."),
  is_unsubscribed: s.boolean("Whether the contact has unsubscribed."),
  unsubscribed_at: s.nullable(
    s.dateTime("The timestamp when the contact unsubscribed, or null when still subscribed."),
  ),
  custom_fields: customFieldsSchema,
  metadata: metadataSchema,
  created_at: s.dateTime("The timestamp when the contact was created."),
  updated_at: s.dateTime("The timestamp when the contact was last updated."),
});

const listContactsInputSchema = s.object(
  "Query parameters for listing Sendmator contacts.",
  {
    limit: s.integer("Number of contacts to return, up to 100."),
    starting_after: s.string("Cursor for pagination.", { minLength: 1 }),
    tag: s.string("Filter contacts by tag.", { minLength: 1 }),
    is_active: s.boolean("Filter contacts by active status."),
    search: s.string("Search across contact name, email, and external_id.", { minLength: 1 }),
    created_after: s.dateTime("Return contacts created after this timestamp."),
    created_before: s.dateTime("Return contacts created before this timestamp."),
  },
  {
    optional: ["limit", "starting_after", "tag", "is_active", "search", "created_after", "created_before"],
  },
);

const createContactInputSchema = s.object(
  "Request body for creating a Sendmator contact.",
  {
    external_id: s.string("External contact ID used to map the contact to another system.", {
      minLength: 1,
    }),
    email: s.email("The contact email address."),
    first_name: s.string("The contact first name.", { minLength: 1 }),
    last_name: s.string("The contact last name.", { minLength: 1 }),
    tags: contactTagsSchema,
    custom_fields: customFieldsSchema,
    metadata: metadataSchema,
  },
  {
    optional: ["external_id", "first_name", "last_name", "tags", "custom_fields", "metadata"],
  },
);

const contactIdInputSchema = s.object("Path parameters for a Sendmator contact endpoint.", {
  contact_id: contactIdSchema,
});

const updateContactInputSchema = s.object(
  "Path parameters and request body for updating a Sendmator contact.",
  {
    contact_id: contactIdSchema,
    external_id: s.string("Updated external contact ID.", { minLength: 1 }),
    email: s.email("Updated contact email address."),
    first_name: s.string("Updated contact first name.", { minLength: 1 }),
    last_name: s.string("Updated contact last name.", { minLength: 1 }),
    tags: contactTagsSchema,
    is_active: s.boolean("Updated active status for the contact."),
    custom_fields: customFieldsSchema,
    metadata: metadataSchema,
  },
  {
    optional: ["external_id", "email", "first_name", "last_name", "tags", "is_active", "custom_fields", "metadata"],
  },
);

const listContactsOutputSchema = s.object("Paginated Sendmator contacts.", {
  contacts: s.array("Contacts returned for the current page.", contactSchema),
  has_more: s.boolean("Whether more contacts are available after this page."),
  next_cursor: s.nullable(s.string("Cursor for the next page, or null when unavailable.")),
});

const deleteContactOutputSchema = s.object("The Sendmator delete contact response.", {
  deleted: s.boolean("Whether the contact was deleted."),
  id: s.string("The deleted Sendmator contact ID."),
});

export type SendmatorActionName =
  | "list_contacts"
  | "create_contact"
  | "get_contact"
  | "update_contact"
  | "delete_contact";

export const sendmatorActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Sendmator contacts with cursor pagination and optional filters.",
    requiredScopes: [],
    inputSchema: listContactsInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Sendmator contact with optional external ID, tags, custom fields, and metadata.",
    requiredScopes: [],
    inputSchema: createContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get a Sendmator contact by ID.",
    requiredScopes: [],
    inputSchema: contactIdInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a Sendmator contact's profile fields, active status, tags, custom fields, or metadata.",
    requiredScopes: [],
    inputSchema: updateContactInputSchema,
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Permanently delete a Sendmator contact by ID.",
    requiredScopes: [],
    inputSchema: contactIdInputSchema,
    outputSchema: deleteContactOutputSchema,
  }),
];
