import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bigmailer";

const brandIdSchema = s.uuid("The BigMailer brand ID.");
const listIdSchema = s.uuid("The BigMailer list ID.");
const messageTypeIdSchema = s.uuid("The BigMailer message type ID.");
const contactIdSchema = s.string({
  description: "The BigMailer contact ID or email address.",
  minLength: 1,
});
const limitSchema = s.integer({
  description: "The maximum number of objects to return.",
  minimum: 1,
  maximum: 100,
});
const cursorSchema = s.string({
  description: "The pagination cursor returned by a previous BigMailer response.",
  minLength: 1,
});
const validateSchema = s.boolean("Whether BigMailer should validate email deliverability before adding the contact.");
const updateOperationSchema = s.stringEnum(["add", "remove", "replace"], {
  description: "How BigMailer should apply the supplied values.",
});

const fieldValueInputSchema = s.object(
  {
    name: s.string({ description: "The BigMailer field tag name.", minLength: 1 }),
    string: s.string("The text value for this field."),
    integer: s.integer("The integer value for this field."),
    date: s.date("The date value for this field."),
  },
  {
    required: ["name"],
    description: "A BigMailer contact field value. Exactly one of string, integer, or date must be provided.",
  },
);

const contactPayloadSchema = {
  email: s.string({
    description: "The contact email address.",
    format: "email",
    minLength: 1,
    maxLength: 100,
  }),
  fieldValues: s.array(
    "Field values to save with the contact. Each name must match a BigMailer field tag name.",
    fieldValueInputSchema,
  ),
  listIds: s.array("IDs of lists the contact should belong to.", listIdSchema),
  unsubscribeAll: s.boolean("Whether to unsubscribe the contact from all future campaigns regardless of message type."),
  unsubscribeIds: s.array("IDs of message types the contact should be unsubscribed from.", messageTypeIdSchema),
} as const;

const createContactInputSchema = s.object(
  {
    brandId: brandIdSchema,
    validate: validateSchema,
    ...contactPayloadSchema,
  },
  {
    required: ["brandId", "email"],
    description: "Input parameters for creating a BigMailer contact.",
  },
);

const updateContactInputSchema = s.object(
  {
    brandId: brandIdSchema,
    contactId: contactIdSchema,
    fieldValuesOp: updateOperationSchema,
    listIdsOp: updateOperationSchema,
    unsubscribeIdsOp: updateOperationSchema,
    ...contactPayloadSchema,
  },
  {
    required: ["brandId", "contactId"],
    description: "Input parameters for updating a BigMailer contact.",
  },
);

const pageSchema = s.object(
  {
    hasMore: s.nullable(s.boolean("Whether BigMailer has more objects after this page.")),
    cursor: s.nullable(s.string("The cursor for the next page when BigMailer returns one.")),
    total: s.nullable(s.integer("The total number of matching items when BigMailer returns it.")),
  },
  { description: "BigMailer cursor pagination metadata." },
);

const engagementSchema = s.looseObject("The BigMailer engagement metrics object.");

const brandSchema = s.object(
  {
    id: s.nullable(s.string("The brand ID.")),
    name: s.nullable(s.string("The brand name.")),
    fromName: s.nullable(s.string("The default From name used by campaigns in this brand.")),
    fromEmail: s.nullable(s.string("The default From email used by campaigns in this brand.")),
    url: s.nullable(s.string("The website URL associated with the brand.")),
    contactLimit: s.nullable(s.integer("The maximum number of contacts allowed in this brand.")),
    numContacts: s.nullable(s.integer("The number of contacts in this brand.")),
    created: s.nullable(s.integer("The Unix timestamp when the brand was created.")),
    engagement: s.nullable(engagementSchema),
    raw: s.looseObject("The raw BigMailer brand object."),
  },
  { description: "A BigMailer brand." },
);

const listSchema = s.object(
  {
    id: s.nullable(s.string("The list ID.")),
    name: s.nullable(s.string("The list name.")),
    all: s.nullable(s.boolean("Whether this list represents all contacts in the brand.")),
    numContacts: s.nullable(s.integer("The number of contacts in the list.")),
    created: s.nullable(s.integer("The Unix timestamp when the list was created.")),
    engagement: s.nullable(engagementSchema),
    raw: s.looseObject("The raw BigMailer list object."),
  },
  { description: "A BigMailer contact list." },
);

const contactSchema = s.object(
  {
    id: s.nullable(s.string("The contact ID.")),
    brandId: s.nullable(s.string("The brand ID that owns the contact.")),
    email: s.nullable(s.string("The contact email address.")),
    fieldValues: s.array("Field values associated with the contact.", s.looseObject("A field value.")),
    listIds: s.array("IDs of lists the contact belongs to.", s.string("A BigMailer list ID.")),
    unsubscribeAll: s.nullable(s.boolean("Whether the contact is unsubscribed from all future campaigns.")),
    unsubscribeIds: s.array(
      "IDs of message types the contact is unsubscribed from.",
      s.string("A BigMailer message type ID."),
    ),
    numSoftBounces: s.nullable(s.integer("The number of soft bounces for the contact.")),
    numHardBounces: s.nullable(s.integer("The number of hard bounces for the contact.")),
    numComplaints: s.nullable(s.integer("The number of complaints for the contact.")),
    created: s.nullable(s.integer("The Unix timestamp when the contact was created.")),
    raw: s.looseObject("The raw BigMailer contact object."),
  },
  { description: "A BigMailer contact." },
);

const idResultSchema = s.object(
  {
    id: s.nullable(s.string("The affected BigMailer object ID.")),
    raw: s.looseObject("The raw BigMailer mutation response."),
  },
  { description: "The BigMailer ID result returned by the mutation." },
);

export const bigmailerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_brands",
    description: "List brands in the BigMailer account.",
    inputSchema: s.object(
      { limit: limitSchema, cursor: cursorSchema },
      { description: "Input parameters for listing BigMailer brands." },
    ),
    outputSchema: s.object(
      {
        page: pageSchema,
        brands: s.array("The BigMailer brands in the current page.", brandSchema),
      },
      { description: "The response returned when listing BigMailer brands." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_brand",
    description: "Get one BigMailer brand by ID.",
    inputSchema: s.object(
      { brandId: brandIdSchema },
      { required: ["brandId"], description: "Input parameters for retrieving a BigMailer brand." },
    ),
    outputSchema: s.object({ brand: brandSchema }, { description: "The response returned for a BigMailer brand." }),
  }),
  defineProviderAction(service, {
    name: "list_lists",
    description: "List contact lists in a BigMailer brand.",
    inputSchema: s.object(
      { brandId: brandIdSchema, limit: limitSchema, cursor: cursorSchema },
      { required: ["brandId"], description: "Input parameters for listing BigMailer lists." },
    ),
    outputSchema: s.object(
      {
        page: pageSchema,
        lists: s.array("The BigMailer lists in the current page.", listSchema),
      },
      { description: "The response returned when listing BigMailer lists." },
    ),
  }),
  defineProviderAction(service, {
    name: "create_list",
    description: "Create a contact list in a BigMailer brand.",
    inputSchema: s.object(
      {
        brandId: brandIdSchema,
        name: s.string({ description: "The list name.", minLength: 1, maxLength: 50 }),
      },
      { required: ["brandId", "name"], description: "Input parameters for creating a BigMailer list." },
    ),
    outputSchema: idResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Get one BigMailer contact list by ID.",
    inputSchema: s.object(
      { brandId: brandIdSchema, listId: listIdSchema },
      { required: ["brandId", "listId"], description: "Input parameters for retrieving a BigMailer list." },
    ),
    outputSchema: s.object({ list: listSchema }, { description: "The response returned for a BigMailer list." }),
  }),
  defineProviderAction(service, {
    name: "update_list",
    description: "Update a BigMailer contact list name.",
    inputSchema: s.object(
      {
        brandId: brandIdSchema,
        listId: listIdSchema,
        name: s.string({ description: "The new list name.", minLength: 1, maxLength: 50 }),
      },
      { required: ["brandId", "listId", "name"], description: "Input parameters for updating a BigMailer list." },
    ),
    outputSchema: idResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_list",
    description: "Delete a BigMailer contact list without deleting its contacts.",
    inputSchema: s.object(
      { brandId: brandIdSchema, listId: listIdSchema },
      { required: ["brandId", "listId"], description: "Input parameters for deleting a BigMailer list." },
    ),
    outputSchema: idResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List contacts in a BigMailer brand, optionally filtered by list.",
    inputSchema: s.object(
      { brandId: brandIdSchema, limit: limitSchema, cursor: cursorSchema, listId: listIdSchema },
      { required: ["brandId"], description: "Input parameters for listing BigMailer contacts." },
    ),
    outputSchema: s.object(
      {
        page: pageSchema,
        contacts: s.array("The BigMailer contacts in the current page.", contactSchema),
      },
      { description: "The response returned when listing BigMailer contacts." },
    ),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a contact in a BigMailer brand.",
    inputSchema: createContactInputSchema,
    outputSchema: idResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one BigMailer contact by ID or email address.",
    inputSchema: s.object(
      { brandId: brandIdSchema, contactId: contactIdSchema },
      { required: ["brandId", "contactId"], description: "Input parameters for retrieving a BigMailer contact." },
    ),
    outputSchema: s.object(
      { contact: contactSchema },
      { description: "The response returned for a BigMailer contact." },
    ),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a BigMailer contact by ID or email address.",
    inputSchema: updateContactInputSchema,
    outputSchema: idResultSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_contact",
    description: "Create or update a BigMailer contact by email address.",
    inputSchema: createContactInputSchema,
    outputSchema: idResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a BigMailer contact by ID or email address.",
    inputSchema: s.object(
      { brandId: brandIdSchema, contactId: contactIdSchema },
      { required: ["brandId", "contactId"], description: "Input parameters for deleting a BigMailer contact." },
    ),
    outputSchema: idResultSchema,
  }),
];
