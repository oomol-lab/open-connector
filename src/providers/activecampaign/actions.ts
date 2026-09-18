import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "activecampaign";

const rawObjectSchema = s.looseObject({}, { description: "Raw ActiveCampaign object." });

const paginationSchema = s.object(
  {
    total: s.nullable(
      s.integer({ description: "Total number of records reported by ActiveCampaign, or null when unavailable." }),
    ),
    limit: s.nullable(s.integer({ description: "Page size echoed by ActiveCampaign, or null when unavailable." })),
    offset: s.nullable(s.integer({ description: "Page offset echoed by ActiveCampaign, or null when unavailable." })),
  },
  {
    required: ["total", "limit", "offset"],
    description: "Normalized ActiveCampaign pagination metadata.",
  },
);

const contactFieldValueSchema = s.object(
  {
    field: s.string({ description: "Custom field identifier." }),
    value: s.string({ description: "Custom field value." }),
    raw: rawObjectSchema,
  },
  {
    required: ["field", "value", "raw"],
    description: "ActiveCampaign contact custom field value.",
  },
);

const contactSchema = s.object(
  {
    id: s.string({ description: "ActiveCampaign contact identifier." }),
    email: s.nullableString("Contact email address, or null when ActiveCampaign omits it."),
    firstName: s.nullableString("Contact first name, or null when ActiveCampaign omits it."),
    lastName: s.nullableString("Contact last name, or null when ActiveCampaign omits it."),
    phone: s.nullableString("Contact phone number, or null when ActiveCampaign omits it."),
    organizationId: s.nullableString("Primary organization identifier, or null when ActiveCampaign omits it."),
    createdAt: s.nullableString("Contact creation timestamp, or null when omitted."),
    updatedAt: s.nullableString("Contact update timestamp, or null when omitted."),
    deleted: s.nullableBoolean("Whether the contact is deleted, or null when ActiveCampaign omits it."),
    fieldValues: s.array(contactFieldValueSchema, {
      description: "Custom field values returned with the contact when present.",
    }),
    raw: rawObjectSchema,
  },
  {
    required: ["id", "email", "firstName", "lastName", "phone", "organizationId", "createdAt", "updatedAt", "raw"],
    description: "Normalized ActiveCampaign contact.",
  },
);

const listSchema = s.object(
  {
    id: s.string({ description: "ActiveCampaign list identifier." }),
    name: s.nullableString("List name, or null when ActiveCampaign omits it."),
    userId: s.nullableString("Owner user identifier, or null when ActiveCampaign omits it."),
    stringId: s.nullableString("URL-safe list identifier, or null when omitted."),
    createdAt: s.nullableString("List creation timestamp, or null when omitted."),
    updatedAt: s.nullableString("List update timestamp, or null when omitted."),
    private: s.nullableBoolean("Whether the list is private, or null when ActiveCampaign omits it."),
    senderName: s.nullableString("Sender name, or null when ActiveCampaign omits it."),
    senderUrl: s.nullableString("Sender website URL, or null when omitted."),
    senderReminder: s.nullableString("Sender reminder text, or null when ActiveCampaign omits it."),
    fullAddress: s.nullableString("Sender address block, or null when omitted."),
    raw: rawObjectSchema,
  },
  {
    required: ["id", "name", "userId", "stringId", "createdAt", "updatedAt", "raw"],
    description: "Normalized ActiveCampaign mailing list.",
  },
);

const fieldSchema = s.object(
  {
    id: s.string({ description: "ActiveCampaign custom field identifier." }),
    title: s.nullableString("Field title, or null when ActiveCampaign omits it."),
    type: s.nullableString("Field type, or null when ActiveCampaign omits it."),
    description: s.nullableString("Field description, or null when ActiveCampaign omits it."),
    personalizationTag: s.nullableString("Personalization tag for the field, or null when omitted."),
    createdAt: s.nullableString("Field creation timestamp, or null when omitted."),
    updatedAt: s.nullableString("Field update timestamp, or null when omitted."),
    visible: s.nullableBoolean("Whether the field is visible, or null when ActiveCampaign omits it."),
    required: s.nullableBoolean("Whether the field is required, or null when ActiveCampaign omits it."),
    showInList: s.nullableBoolean("Whether the field is shown in lists, or null when omitted."),
    options: s.array(rawObjectSchema, { description: "Options returned for dropdown-like fields." }),
    raw: rawObjectSchema,
  },
  {
    required: ["id", "title", "type", "description", "personalizationTag", "createdAt", "updatedAt", "options", "raw"],
    description: "Normalized ActiveCampaign custom field.",
  },
);

const userSchema = s.object(
  {
    id: s.string({ description: "ActiveCampaign user identifier." }),
    email: s.nullableString("User email address, or null when ActiveCampaign omits it."),
    firstName: s.nullableString("User first name, or null when ActiveCampaign omits it."),
    lastName: s.nullableString("User last name, or null when ActiveCampaign omits it."),
    username: s.nullableString("Username, or null when ActiveCampaign omits it."),
    phone: s.nullableString("Phone number, or null when ActiveCampaign omits it."),
    signature: s.nullableString("Email signature, or null when ActiveCampaign omits it."),
    raw: rawObjectSchema,
  },
  {
    required: ["id", "email", "firstName", "lastName", "username", "phone", "signature", "raw"],
    description: "Normalized ActiveCampaign user.",
  },
);

const sortByField = s.stringEnum(["id", "name", "email", "score", "first_name", "last_name"], {
  description: "Contact field used for sorting.",
});
const sortDirectionField = s.stringEnum(["asc", "desc"], {
  description: "Sort direction accepted by the connector.",
});

const fieldValueInputSchema = s.object(
  {
    field: s.nonEmptyString("Custom field identifier."),
    value: s.string({ description: "Custom field value." }),
  },
  {
    required: ["field", "value"],
    description: "One custom field value to write during the contact sync.",
  },
);

const fieldValuesInputSchema = {
  ...s.array(fieldValueInputSchema, { description: "Custom field values to write during the contact sync." }),
  minItems: 1,
};

export const activecampaignActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the current ActiveCampaign user associated with the API token.",
    inputSchema: s.object({}, { description: "Input parameters for reading the current ActiveCampaign user." }),
    outputSchema: s.object(
      {
        user: userSchema,
      },
      { required: ["user"], description: "ActiveCampaign current user response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List ActiveCampaign contacts with pagination, search, and filtering support.",
    inputSchema: s.object(
      {
        limit: s.integer({ description: "Maximum number of contacts to return.", minimum: 1, maximum: 100 }),
        offset: s.nonNegativeInteger("Offset for retrieving the next ActiveCampaign page."),
        search: s.nonEmptyString("Free-text search applied to contact names, email, phone, or organization."),
        emailLike: s.nonEmptyString("Substring filter applied to the contact email address."),
        listId: s.nonEmptyString("Only return contacts associated with this list identifier."),
        tagId: s.positiveInteger("Only return contacts associated with this tag identifier."),
        segmentId: s.positiveInteger("Only return contacts that match this ActiveCampaign segment."),
        idGreater: s.positiveInteger("Only return contacts with an ID greater than this value."),
        idLess: s.positiveInteger("Only return contacts with an ID less than this value."),
        createdAfter: s.string({ description: "Only return contacts created after this date.", format: "date" }),
        createdBefore: s.string({ description: "Only return contacts created before this date.", format: "date" }),
        updatedAfter: s.string({ description: "Only return contacts updated after this date.", format: "date" }),
        updatedBefore: s.string({ description: "Only return contacts updated before this date.", format: "date" }),
        sortBy: sortByField,
        sortDirection: sortDirectionField,
      },
      { description: "Query parameters for listing ActiveCampaign contacts." },
    ),
    outputSchema: s.object(
      {
        contacts: s.array(contactSchema, { description: "Contacts returned by ActiveCampaign." }),
        pagination: paginationSchema,
      },
      { required: ["contacts", "pagination"], description: "ActiveCampaign contact list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get one ActiveCampaign contact by identifier.",
    inputSchema: s.object(
      {
        contactId: s.nonEmptyString("ActiveCampaign contact identifier."),
      },
      { required: ["contactId"], description: "Input parameters for retrieving a single ActiveCampaign contact." },
    ),
    outputSchema: s.object(
      {
        contact: contactSchema,
      },
      { required: ["contact"], description: "ActiveCampaign single contact response." },
    ),
  }),
  defineProviderAction(service, {
    name: "upsert_contact",
    operationType: "write",
    description: "Create or update an ActiveCampaign contact using the official contact sync endpoint.",
    inputSchema: s.object(
      {
        email: s.email("Contact email address used as the sync key."),
        firstName: s.nonEmptyString("Contact first name to create or update."),
        lastName: s.nonEmptyString("Contact last name to create or update."),
        phone: s.nonEmptyString("Contact phone number to create or update."),
        fieldValues: fieldValuesInputSchema,
      },
      {
        required: ["email"],
        description: "Payload for creating or updating an ActiveCampaign contact through the sync endpoint.",
      },
    ),
    outputSchema: s.object(
      {
        contact: contactSchema,
      },
      { required: ["contact"], description: "ActiveCampaign contact sync response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description: "List ActiveCampaign mailing lists with pagination and optional name filtering.",
    inputSchema: s.object(
      {
        limit: s.integer({ description: "Maximum number of lists to return.", minimum: 1, maximum: 100 }),
        offset: s.nonNegativeInteger("Offset for retrieving the next ActiveCampaign page."),
        name: s.nonEmptyString("Substring filter applied to the ActiveCampaign list name."),
      },
      { description: "Query parameters for listing ActiveCampaign mailing lists." },
    ),
    outputSchema: s.object(
      {
        lists: s.array(listSchema, { description: "Mailing lists returned by ActiveCampaign." }),
        pagination: paginationSchema,
      },
      { required: ["lists", "pagination"], description: "ActiveCampaign mailing list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_fields",
    operationType: "read",
    description: "List ActiveCampaign custom contact fields.",
    inputSchema: s.object(
      {
        limit: s.integer({ description: "Maximum number of custom fields to return.", minimum: 1, maximum: 100 }),
        offset: s.nonNegativeInteger("Offset for retrieving the next ActiveCampaign custom fields page."),
      },
      { description: "Query parameters for listing ActiveCampaign custom fields." },
    ),
    outputSchema: s.object(
      {
        fields: s.array(fieldSchema, { description: "Custom fields returned by ActiveCampaign." }),
      },
      { required: ["fields"], description: "ActiveCampaign custom field list response." },
    ),
  }),
];
