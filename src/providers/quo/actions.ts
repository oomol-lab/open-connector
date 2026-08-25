import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "quo" as const;

function nonEmptyString(description: string) {
  return s.string(description, { minLength: 1 });
}

function optionalNonEmptyString(description: string) {
  return nonEmptyString(description);
}

function idString(description: string) {
  return nonEmptyString(description);
}

function e164Phone(description: string) {
  return s.string(description, {
    minLength: 3,
    maxLength: 16,
    pattern: "^\\+[1-9]\\d{1,14}$",
  });
}

const looseRecord = s.looseObject("Raw Quo record returned by the API.");

const pageTokenSchema = optionalNonEmptyString("Opaque page token returned by Quo.");

const contactFieldItemSchema = s.object(
  "One named contact field value.",
  {
    name: nonEmptyString("Display name for this contact field."),
    value: s.nullable(nonEmptyString("Value for this contact field.")),
    id: optionalNonEmptyString("Existing field identifier used when updating a contact field."),
  },
  { optional: ["id"] },
);

const customFieldValueSchema = s.anyOf("Value for a Quo contact custom field.", [
  s.array("String values for a multi-value custom field.", nonEmptyString("Custom field item.")),
  nonEmptyString("String or datetime value for a custom field."),
  s.number("Numeric value for a custom field."),
  s.boolean("Boolean value for a custom field."),
  { type: "null", description: "Clear the custom field value." },
]);

const customFieldSchema = s.object(
  "One Quo contact custom field value.",
  {
    key: nonEmptyString("Identifying key for the contact custom field."),
    id: optionalNonEmptyString("Existing custom field identifier used when updating a contact."),
    value: customFieldValueSchema,
  },
  { optional: ["id"] },
);

const contactDefaultFieldsSchema = s.object(
  "Default Quo contact fields.",
  {
    firstName: s.nullable(nonEmptyString("Contact first name.")),
    lastName: s.nullable(optionalNonEmptyString("Contact last name.")),
    company: s.nullable(optionalNonEmptyString("Contact company name.")),
    role: s.nullable(optionalNonEmptyString("Contact role or title.")),
    emails: s.array("Email fields to store on the contact.", contactFieldItemSchema),
    phoneNumbers: s.array("Phone number fields to store on the contact.", contactFieldItemSchema),
  },
  { optional: ["lastName", "company", "role", "emails", "phoneNumbers"] },
);

const contactInputFields = {
  defaultFields: contactDefaultFieldsSchema,
  customFields: s.array("Custom fields to store on the contact.", customFieldSchema),
  createdByUserId: idString("Quo user ID for the user creating the contact."),
  source: optionalNonEmptyString("Contact source identifier, such as public-api or a custom source."),
  sourceUrl: s.string("URL for the contact in the source system.", {
    format: "uri",
    minLength: 1,
    maxLength: 200,
  }),
  externalId: s.nullable(
    s.string("Unique identifier for this contact in an external system.", {
      minLength: 1,
      maxLength: 75,
    }),
  ),
};

const dataRecordOutputSchema = s.object("Quo single-record response payload.", {
  data: looseRecord,
});

const listOutputSchema = s.object(
  "Quo list response payload.",
  {
    data: s.array("Records returned by Quo.", looseRecord),
    nextPageToken: s.nullable(optionalNonEmptyString("Token for the next page when available.")),
  },
  { optional: ["nextPageToken"] },
);

const listContactsInputSchema = s.object(
  "Input parameters for listing Quo contacts.",
  {
    externalIds: s.array(
      "External contact IDs used to filter contacts.",
      s.string("External contact ID.", {
        minLength: 1,
        maxLength: 75,
      }),
      { minItems: 1 },
    ),
    sources: s.array(
      "Contact source names used to filter contacts.",
      s.string("Contact source name.", {
        minLength: 1,
        maxLength: 75,
      }),
      { minItems: 1 },
    ),
    maxResults: s.integer("Maximum number of contacts to return per page.", {
      minimum: 1,
      maximum: 50,
    }),
    pageToken: pageTokenSchema,
  },
  { optional: ["externalIds", "sources", "maxResults", "pageToken"] },
);

const createContactInputSchema = s.object("Input parameters for creating a Quo contact.", contactInputFields, {
  optional: ["customFields", "createdByUserId", "source", "sourceUrl", "externalId"],
});

const updateContactInputSchema = s.object(
  "Input parameters for updating a Quo contact.",
  {
    id: idString("Quo contact ID to update."),
    ...contactInputFields,
  },
  {
    optional: ["defaultFields", "customFields", "createdByUserId", "source", "sourceUrl", "externalId"],
  },
);

const contactIdInputSchema = s.object("Input parameters for reading or deleting a Quo contact.", {
  id: idString("Quo contact ID."),
});

const listMessagesInputSchema = s.object(
  "Input parameters for listing Quo messages in a conversation.",
  {
    phoneNumberId: idString("Quo phone number ID used to send or receive the messages."),
    participants: s.array(
      "External participant phone numbers in E.164 format.",
      e164Phone("Participant phone number in E.164 format."),
      { minItems: 1 },
    ),
    userId: idString("Quo user ID that sent the message."),
    createdAfter: s.dateTime("Only include messages created after this ISO 8601 timestamp."),
    createdBefore: s.dateTime("Only include messages created before this ISO 8601 timestamp."),
    maxResults: s.integer("Maximum number of messages to return per page.", {
      minimum: 1,
      maximum: 100,
    }),
    pageToken: pageTokenSchema,
  },
  {
    optional: ["userId", "createdAfter", "createdBefore", "maxResults", "pageToken"],
  },
);

const messageIdInputSchema = s.object("Input parameters for reading a Quo message.", {
  id: idString("Quo message ID."),
});

const sendTextMessageInputSchema = s.object(
  "Input parameters for sending a Quo text message.",
  {
    content: s.string("Text content to send.", {
      minLength: 1,
      maxLength: 1600,
    }),
    from: s.anyOf("Quo sender phone number ID or E.164 phone number.", [
      idString("Quo phone number ID."),
      e164Phone("Sender phone number in E.164 format."),
    ]),
    to: s.array("Recipient phone numbers.", e164Phone("Recipient phone number in E.164 format."), {
      minItems: 1,
      maxItems: 1,
    }),
    userId: idString("Quo user ID to send the message as."),
    setInboxStatus: s.stringEnum("Conversation inbox status to set after sending.", ["done"]),
  },
  { optional: ["userId", "setInboxStatus"] },
);

const listPhoneNumbersInputSchema = s.object(
  "Input parameters for listing Quo phone numbers.",
  {
    userId: idString("Only return phone numbers associated with this Quo user ID."),
  },
  { optional: ["userId"] },
);

const phoneNumberIdInputSchema = s.object("Input parameters for reading a Quo phone number.", {
  phoneNumberId: idString("Quo phone number ID."),
});

const listUsersInputSchema = s.object(
  "Input parameters for listing Quo users.",
  {
    maxResults: s.integer("Maximum number of users to return per page.", {
      minimum: 1,
      maximum: 50,
    }),
    pageToken: pageTokenSchema,
  },
  { optional: ["maxResults", "pageToken"] },
);

const userIdInputSchema = s.object("Input parameters for reading a Quo user.", {
  userId: idString("Quo user ID."),
});

export const quoActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_phone_numbers",
    description: "List phone numbers in the connected Quo workspace.",
    requiredScopes: [],
    inputSchema: listPhoneNumbersInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_phone_number",
    description: "Get details for a Quo phone number by ID.",
    requiredScopes: [],
    inputSchema: phoneNumberIdInputSchema,
    outputSchema: dataRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List users in the connected Quo workspace.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get details for a Quo user by ID.",
    requiredScopes: [],
    inputSchema: userIdInputSchema,
    outputSchema: dataRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List contacts in the connected Quo workspace with optional filters.",
    requiredScopes: [],
    inputSchema: listContactsInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get details for a Quo contact by ID.",
    requiredScopes: [],
    inputSchema: contactIdInputSchema,
    outputSchema: dataRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a contact in the connected Quo workspace.",
    requiredScopes: [],
    inputSchema: createContactInputSchema,
    outputSchema: dataRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a contact in the connected Quo workspace.",
    requiredScopes: [],
    inputSchema: updateContactInputSchema,
    outputSchema: dataRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a contact from the connected Quo workspace.",
    requiredScopes: [],
    inputSchema: contactIdInputSchema,
    outputSchema: s.object("Quo delete contact response payload.", {
      data: s.nullable(looseRecord),
    }),
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List messages exchanged between a Quo number and conversation participants.",
    requiredScopes: [],
    inputSchema: listMessagesInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Get details for a Quo message by ID.",
    requiredScopes: [],
    inputSchema: messageIdInputSchema,
    outputSchema: dataRecordOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_text_message",
    description: "Send a text message from a Quo phone number.",
    requiredScopes: [],
    inputSchema: sendTextMessageInputSchema,
    outputSchema: dataRecordOutputSchema,
  }),
];
