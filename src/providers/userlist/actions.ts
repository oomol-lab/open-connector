import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "userlist";

const customPropertiesSchema = s.looseObject(
  "Custom properties stored by Userlist. Keys are normalized to snake_case by Userlist.",
);

const resourceIdentifierSchema = s.anyOf("A Userlist resource identifier.", [
  s.string("A string identifier.", { minLength: 1 }),
  s.number("A numeric identifier."),
]);

const userReferenceSchema = s.anyOf("A Userlist user identifier or embedded user object.", [
  resourceIdentifierSchema,
  s.looseObject("An embedded user object accepted by Userlist.", {
    identifier: resourceIdentifierSchema,
    email: s.email("The email address of the user."),
    signed_up_at: s.dateTime("When the user signed up."),
    properties: customPropertiesSchema,
  }),
]);

const companyReferenceSchema = s.anyOf("A Userlist company identifier or embedded company object.", [
  resourceIdentifierSchema,
  s.looseObject("An embedded company object accepted by Userlist.", {
    identifier: resourceIdentifierSchema,
    name: s.string("The company name.", { minLength: 1 }),
    signed_up_at: s.dateTime("When the company signed up."),
    properties: customPropertiesSchema,
  }),
]);

const relationshipSchema = s.object(
  "A relationship between a Userlist user and company.",
  {
    user: userReferenceSchema,
    company: companyReferenceSchema,
    properties: customPropertiesSchema,
  },
  { optional: ["properties"] },
);

const userRelationshipSchema = s.object(
  "A relationship from this Userlist user to a company.",
  {
    company: companyReferenceSchema,
    properties: customPropertiesSchema,
  },
  { optional: ["properties"] },
);

const companyRelationshipSchema = s.object(
  "A relationship from this Userlist company to a user.",
  {
    user: userReferenceSchema,
    properties: customPropertiesSchema,
  },
  { optional: ["properties"] },
);

const subscriptionPreferenceSchema = s.object("A Userlist subscription preference update.", {
  topic: s.string("The topic identifier from Userlist topic settings.", { minLength: 1 }),
  subscribed: s.boolean("Whether the user is subscribed to the topic."),
});

const acceptedOutputSchema = s.object("A Userlist Push API acceptance result.", {
  accepted: s.boolean("Whether Userlist accepted the request for asynchronous processing."),
  status: s.integer("The HTTP status code returned by Userlist."),
});

const messageBodyPartSchema = s.object("One multipart Userlist message body part.", {
  type: s.stringEnum("The content type for this body part.", ["html", "text"]),
  content: s.string("The body part content.", { minLength: 1 }),
});

const messageBodySchema = s.oneOf(
  [
    s.object("An HTML Userlist message body.", {
      type: s.literal("html", { description: "HTML message body." }),
      content: s.string("The HTML body content.", { minLength: 1 }),
    }),
    s.object("A plain-text Userlist message body.", {
      type: s.literal("text", { description: "Plain-text message body." }),
      content: s.string("The plain-text body content.", { minLength: 1 }),
    }),
    s.object("A multipart Userlist message body.", {
      type: s.literal("multipart", { description: "Multipart message body." }),
      content: s.array("Multipart body parts.", messageBodyPartSchema, { minItems: 1 }),
    }),
  ],
  { description: "The Userlist transactional message body." },
);

const pushUserInputSchema = withAllOf(
  s.object(
    "Input for creating or updating a Userlist user.",
    {
      identifier: resourceIdentifierSchema,
      email: s.email("The email address of the user."),
      signed_up_at: s.dateTime("When the user signed up."),
      properties: customPropertiesSchema,
      relationships: s.array("Relationships to companies for this user.", userRelationshipSchema, {
        minItems: 1,
      }),
      company: companyReferenceSchema,
      companies: s.array("Company identifiers or embedded companies.", companyReferenceSchema, {
        minItems: 1,
      }),
      preferences: s.array("Subscription preference updates for this user.", subscriptionPreferenceSchema, {
        minItems: 1,
      }),
    },
    {
      optional: [
        "identifier",
        "email",
        "signed_up_at",
        "properties",
        "relationships",
        "company",
        "companies",
        "preferences",
      ],
    },
  ),
  [{ anyOf: [{ required: ["identifier"] }, { required: ["email"] }] }],
);

const createEventInputSchema = withAllOf(
  s.object(
    "Input for creating a Userlist event.",
    {
      name: s.string("The event name.", { minLength: 1 }),
      user: userReferenceSchema,
      company: companyReferenceSchema,
      occurred_at: s.dateTime("When the event occurred."),
      properties: customPropertiesSchema,
    },
    { optional: ["user", "company", "occurred_at", "properties"] },
  ),
  [{ anyOf: [{ required: ["user"] }, { required: ["company"] }] }],
);

const sendMessageInputSchema = withAllOf(
  s.object(
    "Input for sending a Userlist transactional message.",
    {
      template: s.string("The transactional message template identifier.", { minLength: 1 }),
      user: userReferenceSchema,
      company: companyReferenceSchema,
      properties: customPropertiesSchema,
      channel: s.stringEnum("The delivery channel for the message.", ["email", "web"]),
      to: s.email("The recipient email address for email messages."),
      from: s.email("The sender email address for email messages."),
      reply_to: s.email("The reply-to email address for email messages."),
      subject: s.string("The custom message subject. Required when template is omitted.", {
        minLength: 1,
      }),
      preheader: s.string("The custom email preheader text.", { minLength: 1 }),
      body: messageBodySchema,
      sender: s.string("The sender identifier configured in Userlist.", { minLength: 1 }),
      theme: s.anyOf("The theme identifier to apply, or false to disable theming.", [
        s.string("The theme identifier configured in Userlist.", { minLength: 1 }),
        s.literal(false, { description: "Disable theming for this message." }),
      ]),
      topic: s.string("The topic identifier configured in Userlist.", { minLength: 1 }),
    },
    {
      optional: [
        "template",
        "user",
        "company",
        "properties",
        "channel",
        "to",
        "from",
        "reply_to",
        "subject",
        "preheader",
        "body",
        "sender",
        "theme",
        "topic",
      ],
    },
  ),
  [
    { anyOf: [{ required: ["user"] }, { required: ["to"] }] },
    { anyOf: [{ required: ["template"] }, { required: ["subject", "body"] }] },
    {
      not: {
        required: ["channel", "to"],
        properties: {
          channel: { const: "web" },
        },
      },
    },
  ],
);

export const userlistActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "push_user",
    description: "Create or update a Userlist user through the Push API.",
    inputSchema: pushUserInputSchema,
    outputSchema: acceptedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "push_company",
    description: "Create or update a Userlist company through the Push API.",
    inputSchema: s.object(
      "Input for creating or updating a Userlist company.",
      {
        identifier: resourceIdentifierSchema,
        name: s.string("The company name.", { minLength: 1 }),
        signed_up_at: s.dateTime("When the company signed up."),
        properties: customPropertiesSchema,
        relationships: s.array("Relationships to users for this company.", companyRelationshipSchema, {
          minItems: 1,
        }),
        user: userReferenceSchema,
        users: s.array("User identifiers or embedded users.", userReferenceSchema, {
          minItems: 1,
        }),
      },
      { optional: ["name", "signed_up_at", "properties", "relationships", "user", "users"] },
    ),
    outputSchema: acceptedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "push_relationship",
    description: "Create or update a Userlist relationship between a user and a company.",
    inputSchema: relationshipSchema,
    outputSchema: acceptedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_event",
    description: "Create a Userlist event for a user, company, or both.",
    inputSchema: createEventInputSchema,
    outputSchema: acceptedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a Userlist transactional message to a user or email address.",
    inputSchema: sendMessageInputSchema,
    outputSchema: acceptedOutputSchema,
  }),
];

function withAllOf(schema: JsonSchema, allOf: JsonSchema[]): JsonSchema {
  return {
    ...schema,
    allOf,
  };
}
