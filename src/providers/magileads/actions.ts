import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "magileads";
const contactListSchema = s.looseRequiredObject("A Magileads contact list.", {
  id: s.integer("The contact list identifier."),
  name: s.string("The contact list name."),
});
const idInput = s.requiredObject("Path parameters for a Magileads contact list.", {
  contact_list_id: s.integer("The contact list identifier."),
});
const mutationFields = {
  name: s.nonEmptyString("The contact list name."),
  tags_ids: s.array("Tag identifiers to associate with the contact list.", s.integer("A tag identifier.")),
  folder_id: s.integer("The folder identifier for the contact list."),
  language: s.nullableString("The ISO 639-3 preferred language code, or null to clear it."),
  country: s.nullableString("The ISO 3166-1 alpha-2 preferred country code, or null to clear it."),
};
const updateInputSchema = {
  ...s.object(
    "The contact list identifier and attributes to update.",
    {
      contact_list_id: s.integer("The contact list identifier."),
      ...mutationFields,
      pin: s.nullableBoolean("Whether the contact list is pinned, or null to clear the setting."),
    },
    { required: ["contact_list_id"] },
  ),
  anyOf: ["name", "tags_ids", "folder_id", "language", "country", "pin"].map((key) => ({ required: [key] })),
} satisfies JsonSchema;
const stateOutput = s.looseRequiredObject("A successful Magileads mutation response.", {
  state: s.boolean("Whether Magileads reports a successful operation."),
});

export const magileadsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contact_lists",
    operationType: "read",
    description: "List all Magileads contact lists available to the authenticated account, including shared lists.",
    inputSchema: s.object("This action does not require any input.", {}),
    outputSchema: s.looseRequiredObject("The Magileads contact list collection response.", {
      state: s.boolean("Whether Magileads reports a successful operation."),
      contact_lists: s.array("Contact lists available to the account.", contactListSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact_list",
    operationType: "read",
    description: "Get the profile and metadata of one Magileads contact list by identifier.",
    inputSchema: idInput,
    outputSchema: s.looseRequiredObject("The Magileads contact list profile response.", {
      state: s.boolean("Whether Magileads reports a successful operation."),
      contact_list_profile: contactListSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact_list",
    operationType: "write",
    description: "Create a Magileads contact list with optional tags, folder, language, and country metadata.",
    inputSchema: s.object("The contact list attributes to create.", mutationFields, { required: ["name"] }),
    outputSchema: s.looseRequiredObject("The Magileads contact list creation response.", {
      state: s.boolean("Whether Magileads reports a successful operation."),
      contact_list_id: s.integer("The identifier of the created contact list."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_contact_list",
    operationType: "write",
    description: "Update the metadata of one Magileads contact list by identifier.",
    inputSchema: updateInputSchema,
    outputSchema: stateOutput,
  }),
  defineProviderAction(service, {
    name: "delete_contact_list",
    operationType: "destructive",
    description: "Delete one Magileads contact list by identifier.",
    inputSchema: idInput,
    outputSchema: stateOutput,
  }),
];
