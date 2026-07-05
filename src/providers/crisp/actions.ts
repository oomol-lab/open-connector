import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "crisp";

const timestampSchema = s.integer("A Crisp timestamp in milliseconds.");
const optionalTextSchema = s.nullable(s.string("A string value returned by Crisp."));
const sessionIdSchema = s.nonEmptyString("The Crisp conversation session identifier.");

const visitorSchema = s.object(
  "Visitor metadata normalized from a Crisp conversation.",
  {
    nickname: optionalTextSchema,
    email: optionalTextSchema,
  },
  { optional: ["nickname", "email"] },
);
const unreadSchema = s.object(
  "Unread message counters returned by Crisp.",
  {
    operator: s.integer("Unread messages visible to operators."),
    visitor: s.integer("Unread messages visible to the visitor."),
  },
  { optional: ["operator", "visitor"] },
);
const conversationSchema = s.object(
  "A Crisp conversation with stable top-level fields and the raw upstream object.",
  {
    sessionId: s.string("The Crisp conversation session identifier."),
    websiteId: s.string("The Crisp website identifier."),
    state: s.string("The Crisp conversation state."),
    status: s.integer("The Crisp conversation status code."),
    lastMessage: optionalTextSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    unread: unreadSchema,
    visitor: visitorSchema,
    raw: s.looseObject("The raw Crisp conversation object."),
  },
  {
    optional: ["state", "status", "lastMessage", "createdAt", "updatedAt", "unread", "visitor"],
  },
);
const messageUserSchema = s.object(
  "User metadata normalized from a Crisp message.",
  {
    userId: s.string("The Crisp user identifier attached to the message."),
    nickname: s.string("The user nickname attached to the message."),
  },
  { optional: ["userId", "nickname"] },
);
const messageSchema = s.object(
  "A Crisp conversation message with stable top-level fields and the raw upstream object.",
  {
    sessionId: s.string("The Crisp conversation session identifier."),
    websiteId: s.string("The Crisp website identifier."),
    type: s.string("The Crisp message type."),
    from: s.string("The Crisp message sender side."),
    origin: s.string("The Crisp message origin."),
    content: s.unknown("The Crisp message content."),
    fingerprint: s.number("The Crisp message fingerprint."),
    timestamp: timestampSchema,
    user: messageUserSchema,
    raw: s.looseObject("The raw Crisp message object."),
  },
  {
    optional: ["type", "from", "origin", "content", "fingerprint", "timestamp", "user"],
  },
);
const websiteSchema = s.object(
  "A Crisp website returned by the REST API.",
  {
    websiteId: s.string("The Crisp website identifier."),
    name: s.string("The Crisp website name."),
    domain: s.string("The Crisp website domain."),
    logo: optionalTextSchema,
    verified: s.boolean("Whether the Crisp website is verified."),
    institutional: s.boolean("Whether the Crisp website is institutional."),
    raw: s.looseObject("The raw Crisp website object."),
  },
  { optional: ["name", "domain", "logo", "verified", "institutional"] },
);

export type CrispActionName =
  | "get_website"
  | "list_conversations"
  | "get_conversation"
  | "list_conversation_messages"
  | "send_text_message";

export const crispActions: Array<ProviderActionDefinition<CrispActionName>> = [
  defineProviderAction(service, {
    name: "get_website",
    description: "Retrieve the Crisp website connected to the configured token.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving the Crisp website connected to this credential.", {}),
    outputSchema: s.object("The Crisp website connected to this credential.", {
      website: websiteSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_conversations",
    description: "List conversations for the connected Crisp website.",
    requiredScopes: [],
    providerPermissions: ["website:conversation:sessions"],
    inputSchema: s.object(
      "Input parameters for listing Crisp conversations.",
      {
        pageNumber: s.positiveInteger("The 1-based conversation page number to request from Crisp."),
        perPage: s.positiveInteger("The number of conversations to request per page."),
        searchQuery: s.nonEmptyString("Search text used by Crisp conversation search."),
        includeEmpty: s.boolean("Whether Crisp should include empty conversations."),
        filterUnread: s.boolean("Whether Crisp should return only unread conversations."),
        filterResolved: s.boolean("Whether Crisp should return only resolved conversations."),
        filterNotResolved: s.boolean("Whether Crisp should return only unresolved conversations."),
        filterAssigned: s.boolean("Whether Crisp should return only assigned conversations."),
        filterUnassigned: s.boolean("Whether Crisp should return only unassigned conversations."),
      },
      {
        optional: [
          "pageNumber",
          "perPage",
          "searchQuery",
          "includeEmpty",
          "filterUnread",
          "filterResolved",
          "filterNotResolved",
          "filterAssigned",
          "filterUnassigned",
        ],
      },
    ),
    outputSchema: s.object("A page of Crisp conversations.", {
      conversations: s.array("The conversations returned by Crisp.", conversationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_conversation",
    description: "Retrieve one Crisp conversation by session ID.",
    requiredScopes: [],
    providerPermissions: ["website:conversation:sessions"],
    inputSchema: s.object("Input parameters for retrieving a Crisp conversation.", {
      sessionId: sessionIdSchema,
    }),
    outputSchema: s.object("A Crisp conversation response.", {
      conversation: conversationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_conversation_messages",
    description: "List messages in a Crisp conversation.",
    requiredScopes: [],
    providerPermissions: ["website:conversation:messages"],
    inputSchema: s.object(
      "Input parameters for listing messages in a Crisp conversation.",
      {
        sessionId: sessionIdSchema,
        timestampBefore: timestampSchema,
        timestampAfter: timestampSchema,
        timestampAround: timestampSchema,
      },
      { required: ["sessionId"], optional: ["timestampBefore", "timestampAfter", "timestampAround"] },
    ),
    outputSchema: s.object("Crisp conversation messages.", {
      messages: s.array("The messages returned by Crisp.", messageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "send_text_message",
    description: "Send an operator text message to a Crisp conversation.",
    requiredScopes: [],
    providerPermissions: ["website:conversation:messages"],
    inputSchema: s.object(
      "Input parameters for sending a text message to a Crisp conversation.",
      {
        sessionId: sessionIdSchema,
        content: s.nonEmptyString("The text content to send to the Crisp conversation."),
        origin: s.stringEnum("The Crisp message origin to use for the text message.", ["chat", "email"]),
      },
      { required: ["sessionId", "content"], optional: ["origin"] },
    ),
    outputSchema: s.object(
      "The Crisp text message dispatch result.",
      {
        reason: s.string("The Crisp response reason."),
        fingerprint: s.number("The dispatched Crisp message fingerprint."),
      },
      { optional: ["fingerprint"] },
    ),
  }),
];
