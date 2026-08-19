import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "loops";

const emailField = s.email("The contact's email address.");
const userIdField = s.nonEmptyString("The unique user ID from an external application.");
const customValueSchema = s.union(
  [
    s.string("A string custom property value."),
    s.number("A numeric custom property value."),
    s.boolean("A boolean custom property value."),
    { type: "null", description: "A null value used to clear a property." },
  ],
  { description: "A custom property value accepted by Loops." },
);
const customPropertiesSchema = s.record(
  "Custom contact or event properties keyed by their Loops property name.",
  customValueSchema,
);
const mailingListsSchema = s.record(
  "Mailing list subscription changes keyed by Loops mailing list ID.",
  s.boolean("Whether the contact should be subscribed to this mailing list."),
);

const successIdSchema = s.object("A successful Loops contact mutation response.", {
  success: s.boolean("Whether Loops accepted the request."),
  id: s.string("The internal Loops contact ID."),
});

const successMessageSchema = s.object("A successful Loops operation response.", {
  success: s.boolean("Whether Loops accepted the request."),
  message: s.string("The message returned by Loops."),
});

const contactSchema = s.looseObject("A Loops contact with default and custom properties.", {
  id: s.string("The contact's Loops-assigned ID."),
  email: s.string("The contact's email address."),
  firstName: s.nullableString("The contact's first name."),
  lastName: s.nullableString("The contact's last name."),
  source: s.string("The source the contact was created from."),
  subscribed: s.boolean("Whether the contact receives campaign and workflow emails."),
  userGroup: s.string("The contact's user group."),
  userId: s.nullableString("The contact's unique user ID."),
  mailingLists: s.record(
    "Mailing lists the contact is subscribed to, keyed by mailing list ID.",
    s.boolean("Whether the contact is subscribed to the mailing list."),
  ),
  optInStatus: s.nullableString("The contact's double opt-in status, when double opt-in applies."),
});

const createContactInputSchema = s.object(
  "The input payload for creating a Loops contact.",
  {
    email: emailField,
    firstName: s.nonEmptyString("The contact's first name."),
    lastName: s.nonEmptyString("The contact's last name."),
    source: s.nonEmptyString('A custom source value that replaces the default "API" source.'),
    subscribed: s.boolean("Whether the contact receives campaign and workflow emails."),
    userGroup: s.nonEmptyString("The user group used to segment the contact."),
    userId: userIdField,
    mailingLists: mailingListsSchema,
    customProperties: customPropertiesSchema,
  },
  {
    optional: [
      "firstName",
      "lastName",
      "source",
      "subscribed",
      "userGroup",
      "userId",
      "mailingLists",
      "customProperties",
    ],
    additionalProperties: true,
  },
);

const updateContactInputSchema: JsonSchema = {
  ...s.looseObject("The input payload for updating or creating a Loops contact.", {
    email: emailField,
    userId: userIdField,
    firstName: s.nonEmptyString("The contact's first name."),
    lastName: s.nonEmptyString("The contact's last name."),
    source: s.nonEmptyString('A custom source value that replaces the default "API" source.'),
    subscribed: s.boolean("Whether the contact receives campaign and workflow emails."),
    userGroup: s.nonEmptyString("The user group used to segment the contact."),
    mailingLists: mailingListsSchema,
    customProperties: customPropertiesSchema,
  }),
  anyOf: [{ required: ["email"] }, { required: ["userId"] }],
};

const lookupContactInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for finding or deleting a Loops contact.",
    {
      email: emailField,
      userId: userIdField,
    },
    { optional: ["email", "userId"] },
  ),
  oneOf: [{ required: ["email"] }, { required: ["userId"] }],
};

const createContactPropertyInputSchema = s.object("The input payload for creating a Loops contact property.", {
  name: s.nonEmptyString("The camelCase contact property name."),
  type: s.stringEnum("The Loops contact property type.", ["string", "number", "boolean", "date"]),
});

const listContactPropertiesInputSchema = s.object(
  "The input payload for listing Loops contact properties.",
  {
    list: s.stringEnum("Which contact properties to list.", ["all", "custom"]),
  },
  { optional: ["list"] },
);

const contactPropertySchema = s.object("A Loops contact property.", {
  key: s.string("The contact property key."),
  label: s.string("The contact property label."),
  type: s.string("The contact property type."),
});

const contactPropertyMutationSchema = s.object("A successful Loops contact property mutation response.", {
  success: s.boolean("Whether Loops accepted the request."),
  name: s.string("The contact property name."),
  type: s.string("The contact property type."),
});

const mailingListSchema = s.object("A Loops mailing list.", {
  id: s.string("The Loops mailing list ID."),
  name: s.string("The mailing list name."),
  description: s.string("The mailing list description."),
  isPublic: s.boolean("Whether the mailing list is public."),
});

const sendEventInputSchema: JsonSchema = {
  ...s.looseObject("The input payload for sending a Loops event.", {
    eventName: s.nonEmptyString("The Loops event name to trigger."),
    email: emailField,
    userId: userIdField,
    idempotencyKey: s.nonEmptyString("An optional idempotency key sent as the Idempotency-Key header."),
    eventProperties: customPropertiesSchema,
    contactProperties: customPropertiesSchema,
  }),
  required: ["eventName"],
  anyOf: [{ required: ["email"] }, { required: ["userId"] }],
};

export const loopsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Loops contact with default and custom contact properties.",
    inputSchema: createContactInputSchema,
    outputSchema: successIdSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update or create a Loops contact by email or userId.",
    inputSchema: updateContactInputSchema,
    outputSchema: successIdSchema,
  }),
  defineProviderAction(service, {
    name: "find_contact",
    description: "Find Loops contacts by email or userId.",
    inputSchema: lookupContactInputSchema,
    outputSchema: s.array("Contacts returned by Loops.", contactSchema),
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a Loops contact by email or userId.",
    inputSchema: lookupContactInputSchema,
    outputSchema: successMessageSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact_property",
    description: "Create a custom contact property in Loops.",
    inputSchema: createContactPropertyInputSchema,
    outputSchema: contactPropertyMutationSchema,
  }),
  defineProviderAction(service, {
    name: "list_contact_properties",
    description: "List default or custom Loops contact properties.",
    inputSchema: listContactPropertiesInputSchema,
    outputSchema: s.array("Contact properties returned by Loops.", contactPropertySchema),
  }),
  defineProviderAction(service, {
    name: "list_mailing_lists",
    description: "List Loops mailing lists available to the current API key.",
    inputSchema: s.object("The input payload for listing Loops mailing lists.", {}),
    outputSchema: s.array("Mailing lists returned by Loops.", mailingListSchema),
  }),
  defineProviderAction(service, {
    name: "send_event",
    description: "Send a Loops event to trigger workflows for a contact.",
    inputSchema: sendEventInputSchema,
    outputSchema: successMessageSchema,
  }),
];
