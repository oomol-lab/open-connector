import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "heyy";

const externalIdSchema = s.string({
  minLength: 1,
  pattern: "^[A-Za-z][A-Za-z0-9_]*$",
  description: "The Heyy attribute external ID.",
});

const contactLabelInputSchema = s.object("A Heyy label reference for a contact.", {
  name: s.nonEmptyString("The Heyy label name."),
});

const contactAttributeInputSchema = s.object("A Heyy custom attribute value for a contact.", {
  externalId: externalIdSchema,
  value: s.nonEmptyString("The Heyy attribute value."),
});

const contactPayloadFields = {
  firstName: s.nullableString("The contact first name."),
  lastName: s.nullableString("The contact last name."),
  email: s.nullable(s.email("The contact email address.")),
  phoneNumber: s.nullableString("The contact phone number."),
  labels: s.array("Labels to assign to the contact.", contactLabelInputSchema),
  attributes: s.array("Custom attribute values to assign to the contact.", contactAttributeInputSchema),
};

const createContactInputSchema = s.actionInput(
  contactPayloadFields,
  [],
  "The input payload for creating a Heyy contact. At least one of firstName, lastName, email, or phoneNumber is required.",
);

const updateContactInputSchema = s.actionInput(
  {
    contactId: s.nonEmptyString("The Heyy contact ID."),
    firstName: s.nullableString("The contact first name."),
    lastName: s.nullableString("The contact last name."),
    labels: s.array("Labels to assign to the contact.", contactLabelInputSchema),
    attributes: s.array("Custom attribute values to assign to the contact.", contactAttributeInputSchema),
  },
  ["contactId"],
  "The input payload for updating a Heyy contact.",
);

const listContactsInputSchema = s.actionInput(
  {
    page: s.positiveInteger("The Heyy contacts page number."),
    pageSize: s.positiveInteger("The number of Heyy contacts to return."),
    sortBy: s.stringEnum("The Heyy contact field to sort by.", [
      "firstName",
      "lastName",
      "phoneNumber",
      "createdAt",
      "updatedAt",
    ]),
    order: s.stringEnum("The Heyy contact sort order.", ["ASC", "DESC"]),
    search: s.nonEmptyString("Search text used to filter Heyy contacts."),
  },
  [],
  "Query parameters for listing Heyy contacts.",
);

const getContactInputSchema = s.actionInput(
  {
    contactId: s.nonEmptyString("The Heyy contact ID."),
  },
  ["contactId"],
  "The input payload for reading one Heyy contact.",
);

const createLabelInputSchema = s.actionInput(
  {
    name: s.nonEmptyString("The Heyy label name."),
  },
  ["name"],
  "The input payload for creating a Heyy label.",
);

const createAttributeInputSchema = s.actionInput(
  {
    name: s.nonEmptyString("The Heyy attribute name."),
    externalId: externalIdSchema,
    description: s.nullableString("The optional Heyy attribute description."),
    isVisibleQuickEdit: s.boolean("Whether the attribute is visible in quick edit."),
    isVisibleContactsTable: s.boolean("Whether the attribute is visible in the contacts table."),
    isVisibleContactCreate: s.boolean("Whether the attribute is visible while creating contacts."),
  },
  ["name", "externalId"],
  "The input payload for creating a Heyy contact attribute.",
);

const contactAttributeSchema = s.looseRequiredObject("A Heyy contact attribute value.", {
  name: s.string("The Heyy contact attribute name."),
  value: s.string("The Heyy contact attribute value."),
});

const contactSchema = s.looseRequiredObject(
  "A Heyy contact.",
  {
    id: s.string("The Heyy contact ID."),
    firstName: s.string("The contact first name."),
    lastName: s.string("The contact last name."),
    phoneNumber: s.nullable(s.string("The contact phone number.")),
    email: s.nullable(s.string("The contact email address.")),
    labels: s.array("The Heyy labels attached to the contact.", s.string("One Heyy label name.")),
    attributes: s.array("The Heyy contact custom attribute values.", contactAttributeSchema),
    createdAt: s.string("The contact creation timestamp."),
    updatedAt: s.string("The contact update timestamp."),
  },
  { optional: ["firstName", "lastName", "phoneNumber", "email", "labels", "attributes"] },
);

const labelSchema = s.looseRequiredObject("A Heyy label.", {
  id: s.string("The Heyy label ID."),
  name: s.string("The Heyy label name."),
  color: s.string("The Heyy label color."),
  createdAt: s.string("The label creation timestamp."),
  updatedAt: s.string("The label update timestamp."),
});

const attributeSchema = s.looseRequiredObject(
  "A Heyy contact attribute definition.",
  {
    id: s.string("The Heyy attribute ID."),
    name: s.string("The Heyy attribute name."),
    type: s.string("The Heyy attribute type."),
    externalId: s.string("The Heyy attribute external ID."),
    isVisibleQuickEdit: s.boolean("Whether the attribute is visible in quick edit."),
    isVisibleContactsTable: s.boolean("Whether the attribute is visible in the contacts table."),
    isVisibleContactCreate: s.boolean("Whether the attribute is visible while creating contacts."),
    description: s.string("The Heyy attribute description."),
    createdAt: s.string("The attribute creation timestamp."),
    updatedAt: s.string("The attribute update timestamp."),
  },
  { optional: ["externalId", "description"] },
);

const channelSchema = s.looseRequiredObject(
  "A Heyy channel.",
  {
    id: s.string("The Heyy channel ID."),
    name: s.string("The Heyy channel name."),
    type: s.string("The Heyy channel type."),
    status: s.string("The Heyy channel status."),
    vendorDetails: s.looseObject("Provider-specific channel metadata."),
    createdAt: s.string("The channel creation timestamp."),
    updatedAt: s.string("The channel update timestamp."),
  },
  { optional: ["vendorDetails"] },
);

export const heyyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Heyy contacts with optional pagination, sorting, and search.",
    inputSchema: listContactsInputSchema,
    outputSchema: s.actionOutput(
      { contacts: s.array("The Heyy contacts returned by the API.", contactSchema) },
      "The Heyy contacts list output.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one Heyy contact by ID.",
    inputSchema: getContactInputSchema,
    outputSchema: s.actionOutput({ contact: contactSchema }, "The Heyy contact output."),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Heyy contact with profile fields, labels, and custom attributes.",
    inputSchema: createContactInputSchema,
    outputSchema: s.actionOutput({ contact: contactSchema }, "The Heyy contact output."),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a Heyy contact's profile fields, labels, or custom attributes.",
    inputSchema: updateContactInputSchema,
    outputSchema: s.actionOutput({ contact: contactSchema }, "The Heyy contact output."),
  }),
  defineProviderAction(service, {
    name: "list_labels",
    description: "List Heyy labels.",
    inputSchema: s.actionInput({}, [], "The input payload for this action."),
    outputSchema: s.actionOutput(
      { labels: s.array("The Heyy labels returned by the API.", labelSchema) },
      "The Heyy labels list output.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_label",
    description: "Create a Heyy label.",
    inputSchema: createLabelInputSchema,
    outputSchema: s.actionOutput({ label: labelSchema }, "The Heyy label output."),
  }),
  defineProviderAction(service, {
    name: "list_attributes",
    description: "List Heyy contact attribute definitions.",
    inputSchema: s.actionInput({}, [], "The input payload for this action."),
    outputSchema: s.actionOutput(
      { attributes: s.array("The Heyy contact attributes returned by the API.", attributeSchema) },
      "The Heyy attributes list output.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_attribute",
    description: "Create a Heyy contact attribute definition.",
    inputSchema: createAttributeInputSchema,
    outputSchema: s.actionOutput({ attribute: attributeSchema }, "The Heyy attribute output."),
  }),
  defineProviderAction(service, {
    name: "list_channels",
    description: "List Heyy communication channels.",
    inputSchema: s.actionInput({}, [], "The input payload for this action."),
    outputSchema: s.actionOutput(
      { channels: s.array("The Heyy channels returned by the API.", channelSchema) },
      "The Heyy channels list output.",
    ),
  }),
];
