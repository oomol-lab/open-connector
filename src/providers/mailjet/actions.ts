import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailjet";

const nullableStringSchema = (description: string): JsonSchema => s.nullableString(description);

const contactSchema = s.object(
  "A normalized Mailjet contact.",
  {
    id: s.integer("Unique numeric ID of this contact."),
    email: s.email("Contact email address."),
    name: nullableStringSchema("User-selected name for this contact."),
    isExcludedFromCampaigns: s.nullableBoolean("Whether the contact is excluded from marketing campaigns."),
    createdAt: nullableStringSchema("Timestamp when the contact was added to Mailjet."),
    lastActivityAt: nullableStringSchema("Timestamp of the last registered contact activity."),
    lastUpdateAt: nullableStringSchema("Timestamp of the last contact name or exclusion update."),
    raw: s.looseObject("Raw Mailjet contact object."),
  },
  {
    optional: ["name", "isExcludedFromCampaigns", "createdAt", "lastActivityAt", "lastUpdateAt"],
  },
);

const listContactsInputSchema = s.object(
  "Query parameters for listing Mailjet contacts.",
  {
    limit: s.integer("Limit the number of returned contacts. Mailjet allows at most 1000.", {
      minimum: 1,
      maximum: 1000,
    }),
    offset: s.nonNegativeInteger("Define a starting point from which to return contacts."),
    campaign: s.positiveInteger("Return only contacts targeted by this campaign ID."),
    contactsList: s.positiveInteger("Return only contacts that are part of this contact list ID."),
    isExcludedFromCampaigns: s.boolean("When true, return only contacts excluded from marketing campaigns."),
    sort: s.nonEmptyString("Mailjet sort directive, such as Email ASC."),
  },
  {
    optional: ["limit", "offset", "campaign", "contactsList", "isExcludedFromCampaigns", "sort"],
  },
);

const getContactInputSchema = s.object("Path parameters for retrieving one Mailjet contact.", {
  contactId: s.positiveInteger("The Mailjet contact ID."),
});

const createContactInputSchema = s.object(
  "Request body for creating a Mailjet contact.",
  {
    email: s.email("Contact email address. It must be unique in the global contact list."),
    name: s.nonEmptyString("User-selected name for this contact."),
    isExcludedFromCampaigns: s.boolean("Whether the contact should be excluded from marketing campaigns."),
  },
  { optional: ["name", "isExcludedFromCampaigns"] },
);

const updateContactInputSchema: JsonSchema = s.object(
  "Path and body parameters for updating a Mailjet contact.",
  {
    contactId: s.positiveInteger("The Mailjet contact ID."),
    name: s.nonEmptyString("User-selected name for this contact."),
    isExcludedFromCampaigns: s.boolean("Whether the contact should be excluded from marketing campaigns."),
  },
  { optional: ["name", "isExcludedFromCampaigns"] },
);
updateContactInputSchema.anyOf = [{ required: ["name"] }, { required: ["isExcludedFromCampaigns"] }];

const contactListOutputSchema = s.object("Mailjet contact list response.", {
  count: s.integer("Number of contacts returned in this response."),
  total: s.integer("Total number of contacts Mailjet reports for this query."),
  contacts: s.array("Contacts returned by Mailjet.", contactSchema),
});

const singleContactOutputSchema = s.object("Single Mailjet contact response.", {
  contact: contactSchema,
});

export const mailjetActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Mailjet contacts with pagination and selected public contact filters from the Email API.",
    inputSchema: listContactsInputSchema,
    outputSchema: contactListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one Mailjet contact by contact ID.",
    inputSchema: getContactInputSchema,
    outputSchema: singleContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a new Mailjet contact in the global contact list.",
    inputSchema: createContactInputSchema,
    outputSchema: singleContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a Mailjet contact name or campaign exclusion state.",
    inputSchema: updateContactInputSchema,
    outputSchema: singleContactOutputSchema,
  }),
];
