import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "respond_io";
const nullValueSchema: JsonSchema = { type: "null", description: "A null value." };

const contactIdentifierSchema = s.string(
  "The contact identifier in id:<number>, email:<address>, or phone:<number> format.",
  { minLength: 1, pattern: "^(?:id:[1-9][0-9]*|email:.*\\S.*|phone:.*\\S.*)$" },
);
const createContactIdentifierSchema = s.string(
  "The new contact identifier in email:<address> or phone:<number> format.",
  { minLength: 1, pattern: "^(?:email:.*\\S.*|phone:.*\\S.*)$" },
);
const customFieldValueSchema = s.anyOf("A Respond.io custom field value.", [
  s.string("A string custom field value."),
  s.number("A numeric custom field value."),
  s.boolean("A boolean custom field value."),
  { ...nullValueSchema, description: "A null custom field value." },
]);
const customFieldSchema = s.requiredObject("One Respond.io contact custom field value.", {
  name: s.nonWhitespaceString("The custom field name."),
  value: customFieldValueSchema,
});
const contactMutableFields = {
  firstName: s.nonWhitespaceString("The contact's first name."),
  lastName: s.nullableString("The contact's last name when set."),
  phone: s.nullableString("The contact's phone number when set."),
  email: s.nullableString("The contact's email address when set."),
  language: s.nullableString("The contact's language when set."),
  profilePic: s.nullable(
    s.url("The contact's publicly reachable profile image URL. Respond.io fetches this URL upstream."),
  ),
  countryCode: s.nullableString("The contact's country code when set."),
  custom_fields: s.nullable(s.array("The custom field values to store on the contact.", customFieldSchema)),
};
const optionalContactMutableFields = [
  "firstName",
  "lastName",
  "phone",
  "email",
  "language",
  "profilePic",
  "countryCode",
  "custom_fields",
];
const updateContactInputSchema = s.object(
  "Input parameters for updating a Respond.io contact.",
  { identifier: contactIdentifierSchema, ...contactMutableFields },
  { optional: optionalContactMutableFields },
);
const filterOperatorSchema = s.stringEnum("The operator applied to this filter condition.", [
  "isEqualTo",
  "isNotEqualTo",
  "isTimestampAfter",
  "isTimestampBefore",
  "isTimestampBetween",
  "exists",
  "doesNotExist",
  "isGreaterThan",
  "isLessThan",
  "isBetween",
  "hasAnyOf",
  "hasAllOf",
  "hasNoneOf",
]);
const rangeFilterValueSchema = s.requiredObject("A from-to range used by a filter condition.", {
  from: s.nonWhitespaceString("The inclusive lower range value."),
  to: s.nonWhitespaceString("The inclusive upper range value."),
});
const filterConditionSchema = s.requiredObject("One Respond.io contact filter condition.", {
  category: s.stringEnum("The type of contact data evaluated by this condition.", [
    "contactField",
    "contactTag",
    "lifecycle",
  ]),
  field: s.nullableString("The field name, or null when the category has no field name."),
  operator: filterOperatorSchema,
  value: s.anyOf("The value used by the filter operator, or null for existence operators.", [
    s.string("A single filter value."),
    s.array("A list of filter values.", s.string("One filter value.")),
    rangeFilterValueSchema,
    { ...nullValueSchema, description: "A null filter value." },
  ]),
});
const contactFilterSchema = s.object(
  "Boolean groups of Respond.io contact filter conditions.",
  {
    $and: s.array("Conditions that must all match.", filterConditionSchema),
    $or: s.array("Conditions where at least one must match.", filterConditionSchema),
  },
  { optional: ["$and", "$or"] },
);
const limitSchema = s.integer("The maximum number of records to return.", { minimum: 1, maximum: 100 });
const cursorIdSchema = s.integer("The cursor ID used to move forward or backward through paginated results.");
const paginationSchema = s.looseRequiredObject("Respond.io pagination links for this result page.", {
  next: s.string("The next-page URL, or an empty string when there is no next page."),
  previous: s.string("The previous-page URL, or an empty string when there is no previous page."),
});
const contactUserSchema = s.looseRequiredObject("A Respond.io user assigned to a contact.", {
  id: s.integer("The Respond.io user ID."),
  firstName: s.string("The user's first name."),
  lastName: s.string("The user's last name."),
  email: s.string("The user's email address."),
});
const contactSchema = s.looseRequiredObject(
  "A Respond.io contact returned by the API.",
  {
    id: s.integer("The Respond.io contact ID."),
    firstName: s.string("The contact's first name."),
    lastName: s.nullableString("The contact's last name when set."),
    phone: s.nullableString("The contact's phone number when set."),
    email: s.nullableString("The contact's email address when set."),
    language: s.nullableString("The contact's language when set."),
    profilePic: s.nullableString("The contact's profile image URL when set."),
    countryCode: s.nullableString("The contact's country code when set."),
    custom_fields: s.nullable(s.array("The contact's custom field values when returned.", customFieldSchema)),
    status: s.stringEnum("The contact's conversation status when returned.", ["open", "close"]),
    tags: s.array("The tags attached to the contact when returned.", s.string("One contact tag.")),
    assignee: s.nullable(contactUserSchema),
    lifecycle: s.nullableString("The contact's lifecycle stage when set."),
    created_at: s.integer("The contact creation timestamp returned by Respond.io."),
  },
  {
    optional: [
      "lastName",
      "phone",
      "email",
      "language",
      "profilePic",
      "countryCode",
      "custom_fields",
      "status",
      "tags",
      "assignee",
      "lifecycle",
    ],
  },
);
const contactIdOutputSchema = s.looseRequiredObject("A Respond.io contact action response.", {
  contactId: s.integer("The Respond.io contact ID affected by the action."),
});
const tagInputSchema = s.requiredObject("Input parameters for changing Respond.io contact tags.", {
  identifier: contactIdentifierSchema,
  tags: s.array(
    "The contact tags to add or remove.",
    s.nonWhitespaceString("One contact tag, up to 255 characters.", { maxLength: 255 }),
    { minItems: 1, maxItems: 10 },
  ),
});
const workspaceListInputSchema = s.object(
  "Pagination parameters for listing Respond.io workspace resources.",
  { limit: limitSchema, cursorId: cursorIdSchema },
  { optional: ["limit", "cursorId"] },
);
const teamSchema = s.looseRequiredObject("A Respond.io team.", {
  id: s.integer("The Respond.io team ID."),
  name: s.string("The Respond.io team name."),
});
const workspaceUserSchema = s.looseRequiredObject("A Respond.io workspace user.", {
  id: s.integer("The Respond.io user ID."),
  firstName: s.string("The user's first name."),
  lastName: s.string("The user's last name."),
  email: s.string("The user's email address."),
  role: s.stringEnum("The user's workspace role.", ["agent", "manager", "owner"]),
  team: s.nullable(teamSchema),
  restrictions: s.array(
    "The workspace restriction identifiers assigned to this user.",
    s.string("One workspace restriction identifier."),
  ),
});
const channelSchema = s.looseRequiredObject("A Respond.io workspace channel.", {
  id: s.integer("The Respond.io channel ID."),
  name: s.string("The Respond.io channel name."),
  source: s.string("The channel source identifier."),
  created_at: s.integer("The channel creation timestamp returned by Respond.io."),
});

export const respondIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get one Respond.io contact by contact ID, email address, or phone number.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input parameters for retrieving a Respond.io contact.", {
      identifier: contactIdentifierSchema,
    }),
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create a Respond.io contact identified by an email address or phone number.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating a Respond.io contact.",
      { identifier: createContactIdentifierSchema, ...contactMutableFields },
      { optional: ["lastName", "phone", "email", "language", "profilePic", "countryCode", "custom_fields"] },
    ),
    outputSchema: s.looseRequiredObject("The Respond.io contact creation result.", {
      code: s.string("The Respond.io result code."),
      message: s.string("The Respond.io result message."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update one or more fields on an existing Respond.io contact.",
    requiredScopes: [],
    inputSchema: updateContactInputSchema,
    outputSchema: contactIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete a Respond.io contact by contact ID, email address, or phone number.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input parameters for deleting a Respond.io contact.", {
      identifier: contactIdentifierSchema,
    }),
    outputSchema: contactIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_or_update_contact",
    operationType: "write",
    description: "Create a Respond.io contact when it does not exist, or update it when the identifier already exists.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for creating or updating a Respond.io contact.",
      { identifier: contactIdentifierSchema, ...contactMutableFields },
      { optional: ["lastName", "phone", "email", "language", "profilePic", "countryCode", "custom_fields"] },
    ),
    outputSchema: contactIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List Respond.io contacts using workspace timezone-aware filters and cursor pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing Respond.io contacts.",
      {
        search: s.string("Free-text search applied to contacts."),
        timezone: s.nonWhitespaceString("The IANA timezone used to evaluate time-based filters."),
        filter: contactFilterSchema,
        limit: limitSchema,
        cursorId: cursorIdSchema,
      },
      { optional: ["search", "limit", "cursorId"] },
    ),
    outputSchema: s.looseRequiredObject("A paginated Respond.io contact list response.", {
      items: s.array("The contacts returned for this page.", contactSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_contact_tags",
    operationType: "write",
    description: "Add up to ten tags to a Respond.io contact.",
    requiredScopes: [],
    inputSchema: tagInputSchema,
    outputSchema: contactIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_contact_tags",
    operationType: "destructive",
    description: "Remove up to ten tags from a Respond.io contact.",
    requiredScopes: [],
    inputSchema: tagInputSchema,
    outputSchema: contactIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "assign_conversation",
    operationType: "destructive",
    description: "Assign or unassign the open conversation for a Respond.io contact.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input parameters for assigning a Respond.io conversation.", {
      identifier: contactIdentifierSchema,
      assignee: s.anyOf("A Respond.io user ID, email address, or null to unassign.", [
        s.nonWhitespaceString("The assignee email address."),
        s.integer("The assignee Respond.io user ID.", { minimum: 1 }),
        { ...nullValueSchema, description: "A null value that removes the current assignee." },
      ]),
    }),
    outputSchema: contactIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_conversation_status",
    operationType: "destructive",
    description: "Open or close a Respond.io contact conversation with optional closing context.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for updating a Respond.io conversation status.",
      {
        identifier: contactIdentifierSchema,
        status: s.stringEnum("The conversation status to set.", ["open", "close"]),
        category: s.nonWhitespaceString("The closing category when closing the conversation."),
        summary: s.nonWhitespaceString("The closing summary when closing the conversation."),
      },
      { optional: ["category", "summary"] },
    ),
    outputSchema: contactIdOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_comment",
    operationType: "write",
    description: "Add an internal comment to a Respond.io contact conversation.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input parameters for adding a Respond.io conversation comment.", {
      identifier: contactIdentifierSchema,
      text: s.nonWhitespaceString("The internal comment text."),
    }),
    outputSchema: s.looseRequiredObject("The Respond.io conversation comment result.", {
      contactId: s.integer("The Respond.io contact ID that received the comment."),
      text: s.string("The stored comment text."),
      created_at: s.integer("The comment creation timestamp returned by Respond.io."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List users in the connected Respond.io workspace with cursor pagination.",
    requiredScopes: [],
    inputSchema: workspaceListInputSchema,
    outputSchema: s.looseRequiredObject("A paginated Respond.io workspace user list.", {
      items: s.array("The workspace users returned for this page.", workspaceUserSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_channels",
    operationType: "read",
    description: "List channels in the connected Respond.io workspace with cursor pagination.",
    requiredScopes: [],
    inputSchema: workspaceListInputSchema,
    outputSchema: s.looseRequiredObject("A paginated Respond.io workspace channel list.", {
      items: s.array("The workspace channels returned for this page.", channelSchema),
      pagination: paginationSchema,
    }),
  }),
];
