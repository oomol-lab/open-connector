import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "reply_io";
const contactSchema = s.looseObject(
  "Reply.io contact object, including standard contact fields and custom fields when available.",
);
const sequenceSchema = s.looseObject(
  "Reply.io sequence object, including owner, status, archive, health, and detail fields when available.",
);
const customFieldValueSchema = s.oneOf([
  s.string("String custom field value."),
  s.number("Numeric custom field value."),
  s.boolean("Boolean custom field value."),
  { type: "null", description: "Null custom field value." },
]);
const contactFields: Record<string, JsonSchema> = {
  email: s.email("Contact email address."),
  firstName: s.string("Contact first name."),
  lastName: s.string("Contact last name."),
  company: s.string("Contact company name."),
  title: s.string("Contact job title."),
  phone: s.string("Contact phone number."),
  city: s.string("Contact city."),
  state: s.string("Contact state or province."),
  country: s.string("Contact country."),
  industry: s.string("Contact industry."),
  companySize: s.string("Contact company size range."),
  timeZone: s.string("Contact timezone identifier."),
  linkedInProfile: s.nonEmptyString("Contact LinkedIn profile URL."),
  linkedInSalesNavigator: s.nonEmptyString("Contact LinkedIn Sales Navigator URL."),
  linkedInRecruiter: s.nonEmptyString("Contact LinkedIn Recruiter URL."),
  notes: s.string("Notes to store on the contact."),
  ownerUserId: s.positiveInteger("Reply.io user ID that should own the contact."),
  customFields: s.array(
    "Custom field values to store on the contact.",
    s.object("Reply.io contact custom field value.", {
      key: s.nonEmptyString("Custom field key."),
      value: customFieldValueSchema,
    }),
    { minItems: 1 },
  ),
};
const optionalContactFields = Object.keys(contactFields);
const createContactInputSchema: JsonSchema = {
  ...s.object("Fields for creating a Reply.io contact. Provide at least email or a LinkedIn URL.", contactFields, {
    optional: optionalContactFields,
  }),
  anyOf: [
    { required: ["email"] },
    { required: ["linkedInProfile"] },
    { required: ["linkedInSalesNavigator"] },
    { required: ["linkedInRecruiter"] },
  ],
};
const updateContactInputSchema = s.object(
  "Fields for updating a Reply.io contact.",
  {
    id: s.positiveInteger("Reply.io contact ID to update."),
    ...contactFields,
  },
  { optional: optionalContactFields },
);
const listContactsInputSchema = s.object(
  "Query parameters for listing Reply.io contacts.",
  {
    top: s.integer("Maximum number of contacts to return. Reply.io defaults to 25.", { minimum: 1, maximum: 1000 }),
    skip: s.nonNegativeInteger("Number of contacts to skip before returning results."),
  },
  { optional: ["top", "skip"] },
);
const listSequencesInputSchema = s.object(
  "Query parameters for listing Reply.io sequences.",
  {
    top: s.integer("Maximum number of sequences to return. Reply.io defaults to 25.", { minimum: 1, maximum: 1000 }),
    skip: s.nonNegativeInteger("Number of sequences to skip before returning results."),
    status: s.stringEnum("Sequence status to filter by.", ["active", "paused", "new"]),
    ownerUserId: s.positiveInteger("Reply.io user ID that owns the sequence."),
    folderId: s.nonEmptyString("Reply.io sequence folder UUID."),
    isArchived: s.boolean("Whether to return archived or non-archived sequences."),
    name: s.nonEmptyString("Case-insensitive partial sequence name filter."),
  },
  { optional: ["top", "skip", "status", "ownerUserId", "folderId", "isArchived", "name"] },
);
const contactOutputSchema = s.object("Reply.io contact response.", { contact: contactSchema });
const sequenceOutputSchema = s.object("Reply.io sequence response.", { sequence: sequenceSchema });

function idInputSchema(description: string): JsonSchema {
  return s.object(description, { id: s.positiveInteger("Reply.io resource ID.") });
}

export const replyIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated Reply.io user ID and username.",
    inputSchema: s.object("No input is required to retrieve the current Reply.io user.", {}),
    outputSchema: s.object("Authenticated Reply.io user response.", {
      user: s.object("Authenticated Reply.io user information.", {
        userId: s.integer("The authenticated user's Reply.io ID."),
        username: s.string("The authenticated user's username."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Reply.io contacts with optional pagination.",
    inputSchema: listContactsInputSchema,
    outputSchema: s.object("Paginated Reply.io contact list response.", {
      contacts: s.array("Reply.io contacts returned by the API.", contactSchema),
      hasMore: s.boolean("Whether Reply.io has more matching records after this page."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Reply.io contact using standard contact fields.",
    inputSchema: createContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get a Reply.io contact by ID.",
    inputSchema: idInputSchema("Input parameters for retrieving a Reply.io contact."),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a Reply.io contact by ID.",
    inputSchema: updateContactInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_sequences",
    description: "List Reply.io sequences with optional pagination and filters.",
    inputSchema: listSequencesInputSchema,
    outputSchema: s.object("Paginated Reply.io sequence list response.", {
      sequences: s.array("Reply.io sequences returned by the API.", sequenceSchema),
      hasMore: s.boolean("Whether Reply.io has more matching records after this page."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sequence",
    description: "Get a Reply.io sequence by ID.",
    inputSchema: idInputSchema("Input parameters for retrieving a Reply.io sequence."),
    outputSchema: sequenceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "start_sequence",
    description: "Start a paused or new Reply.io sequence.",
    inputSchema: idInputSchema("Input parameters for starting a Reply.io sequence."),
    outputSchema: sequenceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "pause_sequence",
    description: "Pause an active Reply.io sequence.",
    inputSchema: idInputSchema("Input parameters for pausing a Reply.io sequence."),
    outputSchema: sequenceOutputSchema,
  }),
];
