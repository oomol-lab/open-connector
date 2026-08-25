import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mautic" as const;

const contactIdSchema = s.positiveInteger("The numeric Mautic contact ID.");
const segmentIdSchema = s.positiveInteger("The numeric Mautic segment ID.");
const contactFieldsSchema = {
  ...s.looseObject(
    "Contact field values keyed by Mautic field alias, such as email, firstname, lastname, company, or a custom field alias.",
  ),
  minProperties: 1,
};
const contactSchema = s.looseObject("Mautic contact data.", {
  id: contactIdSchema,
  isPublished: s.boolean("Whether the contact is published."),
  points: s.integer("The contact's current points total."),
  dateAdded: s.string("The date and time when the contact was created."),
  dateModified: s.nullableString("The date and time when the contact was last modified."),
  fields: s.looseObject("Contact fields grouped and returned by Mautic."),
  tags: s.array("Tags associated with the contact.", s.looseObject("A Mautic tag.")),
});
const segmentSchema = s.looseObject("Mautic segment data.", {
  id: segmentIdSchema,
  name: s.string("The segment name."),
  publicName: s.string("The segment name displayed to contacts."),
  alias: s.string("The segment alias or slug."),
  description: s.nullableString("The segment description."),
  isPublished: s.boolean("Whether the segment is published."),
  isGlobal: s.boolean("Whether the segment is available to all Mautic users."),
  isPreferenceCenter: s.boolean("Whether the segment is shown in preference centers."),
});

const listInputSchema = s.object(
  "Pagination, search, and ordering parameters for a Mautic collection.",
  {
    search: s.nonEmptyString("A Mautic search expression or text filter applied to the collection."),
    start: s.nonNegativeInteger("The zero-based starting row for the returned collection."),
    limit: s.positiveInteger("The maximum number of records to return."),
    orderBy: s.nonEmptyString("The Mautic field used to order results, such as date_added or lastname."),
    orderByDir: s.stringEnum("The result ordering direction.", ["asc", "desc"]),
    publishedOnly: s.boolean("Whether to return only published records."),
  },
  {
    optional: ["search", "start", "limit", "orderBy", "orderByDir", "publishedOnly"],
  },
);

const listContacts = defineProviderAction(service, {
  name: "list_contacts",
  description: "List Mautic contacts with optional search, pagination, and ordering controls.",
  requiredScopes: [],
  followUpActions: ["mautic.get_contact"],
  inputSchema: listInputSchema,
  outputSchema: s.object("A normalized list of Mautic contacts.", {
    contacts: s.array("Contacts returned by Mautic.", contactSchema),
    total: s.nonNegativeInteger("The total number of matching contacts reported by Mautic."),
  }),
});

const getContact = defineProviderAction(service, {
  name: "get_contact",
  description: "Get a Mautic contact by numeric contact ID.",
  requiredScopes: [],
  inputSchema: s.object("The Mautic contact to retrieve.", {
    contactId: contactIdSchema,
  }),
  outputSchema: s.object("The requested Mautic contact.", {
    contact: contactSchema,
  }),
});

const createContact = defineProviderAction(service, {
  name: "create_contact",
  description: "Create a Mautic contact using standard or instance-specific custom contact field aliases.",
  requiredScopes: [],
  followUpActions: ["mautic.get_contact", "mautic.add_contact_to_segment"],
  inputSchema: s.object("Values used to create a Mautic contact.", {
    fields: contactFieldsSchema,
  }),
  outputSchema: s.object("The created Mautic contact.", {
    contact: contactSchema,
  }),
});

const updateContact = defineProviderAction(service, {
  name: "update_contact",
  description: "Update selected fields on an existing Mautic contact without creating a missing contact.",
  requiredScopes: [],
  followUpActions: ["mautic.get_contact"],
  inputSchema: s.object("The Mautic contact and field values to update.", {
    contactId: contactIdSchema,
    fields: contactFieldsSchema,
  }),
  outputSchema: s.object("The updated Mautic contact.", {
    contact: contactSchema,
  }),
});

const deleteContact = defineProviderAction(service, {
  name: "delete_contact",
  description: "Delete a Mautic contact by numeric contact ID.",
  requiredScopes: [],
  inputSchema: s.object("The Mautic contact to delete.", {
    contactId: contactIdSchema,
  }),
  outputSchema: s.object("The deleted Mautic contact.", {
    contact: contactSchema,
  }),
});

const listSegments = defineProviderAction(service, {
  name: "list_segments",
  description: "List Mautic segments with optional search, pagination, and ordering controls.",
  requiredScopes: [],
  inputSchema: listInputSchema,
  outputSchema: s.object("A normalized list of Mautic segments.", {
    segments: s.array("Segments returned by Mautic.", segmentSchema),
    total: s.nonNegativeInteger("The total number of matching segments reported by Mautic."),
  }),
});

const segmentMembershipInputSchema = s.object("A Mautic contact and segment membership operation.", {
  segmentId: segmentIdSchema,
  contactId: contactIdSchema,
});
const segmentMembershipOutputSchema = s.object("The segment membership operation result.", {
  success: s.boolean("Whether Mautic completed the segment membership operation."),
  segmentId: segmentIdSchema,
  contactId: contactIdSchema,
});

const addContactToSegment = defineProviderAction(service, {
  name: "add_contact_to_segment",
  description: "Manually add a Mautic contact to a segment.",
  requiredScopes: [],
  inputSchema: segmentMembershipInputSchema,
  outputSchema: segmentMembershipOutputSchema,
});

const removeContactFromSegment = defineProviderAction(service, {
  name: "remove_contact_from_segment",
  description: "Manually remove a Mautic contact from a segment.",
  requiredScopes: [],
  inputSchema: segmentMembershipInputSchema,
  outputSchema: segmentMembershipOutputSchema,
});

export const mauticActions: ActionDefinition[] = [
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  listSegments,
  addContactToSegment,
  removeContactFromSegment,
] as const satisfies ActionDefinition[];

export type MauticActionName = (typeof mauticActions)[number]["name"];
