import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nimble";

const fieldValueSchema = s.object(
  "One value for a Nimble contact field.",
  {
    value: s.unknown("The contact field value accepted by Nimble."),
    modifier: s.string("The Nimble modifier for the field value, such as work, home, or mobile."),
  },
  { optional: ["modifier"], additionalProperties: true },
);

const contactFieldsSchema: JsonSchema = {
  ...s.record(
    "Contact fields keyed by their Nimble field names, such as first name, last name, email, or company name.",
    s.array("The values assigned to one Nimble contact field.", fieldValueSchema, { minItems: 1 }),
  ),
  minProperties: 1,
};

const contactSchema = s.looseObject("A contact resource returned by Nimble.", {
  id: s.string("The unique Nimble contact ID."),
  fields: s.unknownObject("The contact fields keyed by their Nimble field names."),
});

const paginationSchema = s.object("Pagination metadata returned by Nimble.", {
  page: s.integer("The current result page."),
  pages: s.integer("The total number of result pages."),
  per_page: s.integer("The number of contacts requested per page."),
  total: s.integer("The total number of matching contacts."),
});

export const nimbleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List or search Nimble contacts with pagination and optional field selection.",
    inputSchema: s.object(
      "Filters and pagination for listing Nimble contacts.",
      {
        keyword: s.nonEmptyString("A keyword to search across indexed contact fields."),
        fields: s.array(
          "The Nimble contact field names to include in each result.",
          s.nonEmptyString("One Nimble contact field name."),
          { minItems: 1 },
        ),
        recordType: s.stringEnum("The contact record type to return.", ["person", "company", "all"]),
        page: s.positiveInteger("The one-based result page."),
        perPage: s.positiveInteger("The number of contacts to return per page."),
        includeTags: s.boolean("Whether Nimble should include tags in each contact."),
      },
      { optional: ["keyword", "fields", "recordType", "page", "perPage", "includeTags"] },
    ),
    outputSchema: s.object("A page of Nimble contacts.", {
      contacts: s.array("The contacts returned by Nimble.", contactSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one Nimble contact by its contact ID.",
    inputSchema: s.object(
      "The contact lookup parameters.",
      {
        contactId: s.nonEmptyString("The unique Nimble contact ID."),
        fields: s.array(
          "The Nimble contact field names to include.",
          s.nonEmptyString("One Nimble contact field name."),
          { minItems: 1 },
        ),
        includeTags: s.boolean("Whether Nimble should include tags in the contact."),
      },
      { optional: ["fields", "includeTags"] },
    ),
    outputSchema: s.object("The requested Nimble contact.", { contact: contactSchema }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a person or company contact in Nimble using native contact fields.",
    inputSchema: s.object(
      "The Nimble contact to create.",
      {
        fields: contactFieldsSchema,
        ownerId: s.nullableString("The Nimble user ID that should own the contact, or null to leave it unassigned."),
        avatarUrl: s.url("The avatar URL stored on the contact."),
      },
      { optional: ["ownerId", "avatarUrl"] },
    ),
    outputSchema: s.object("The contact created by Nimble.", { contact: contactSchema }),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update fields, importance, or avatar information on a Nimble contact.",
    inputSchema: s.requireAnyProperty(
      s.object(
        "The Nimble contact update.",
        {
          contactId: s.nonEmptyString("The unique Nimble contact ID."),
          fields: contactFieldsSchema,
          avatarUrl: s.url("The replacement avatar URL stored on the contact."),
          isImportant: s.boolean("Whether the contact should be marked as important."),
          replaceFields: s.boolean("Whether supplied fields should replace existing values instead of extending them."),
        },
        { optional: ["fields", "avatarUrl", "isImportant", "replaceFields"] },
      ),
      ["fields", "avatarUrl", "isImportant"],
    ),
    outputSchema: s.object("The contact updated by Nimble.", { contact: contactSchema }),
  }),
];
