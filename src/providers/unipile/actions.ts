import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "unipile";

const cursorSchema = s.string({
  description: "A Unipile pagination cursor from a previous list response.",
  minLength: 1,
  pattern: "\\S",
});
const limitSchema = s.integer("The maximum number of items to return, from 1 to 250.", {
  minimum: 1,
  maximum: 250,
});
const isoDateTimeSchema = s.string({
  description: "An ISO 8601 UTC datetime filter such as 2025-12-31T23:59:59.999Z.",
  minLength: 1,
  pattern: "\\S",
});
const accountTypeSchema = s.stringEnum("The connected messaging provider type to filter by.", [
  "WHATSAPP",
  "LINKEDIN",
  "SLACK",
  "TWITTER",
  "MESSENGER",
  "INSTAGRAM",
  "TELEGRAM",
]);
const rawObjectSchema = s.looseObject("The raw object returned by Unipile.");

const accountSchema = s.object("A normalized Unipile account.", {
  id: s.string("The Unipile account identifier."),
  type: s.nullableString("The Unipile account type when returned."),
  name: s.nullableString("The account display name when returned."),
  status: s.nullableString("The account status when returned."),
  createdAt: s.nullableString("The account creation timestamp when returned."),
  raw: rawObjectSchema,
});

const chatSchema = s.object("A normalized Unipile chat.", {
  id: s.string("The Unipile chat identifier."),
  accountId: s.nullableString("The Unipile account identifier associated with the chat."),
  accountType: s.nullableString("The messaging provider type associated with the chat."),
  providerId: s.nullableString("The upstream provider chat identifier when returned."),
  name: s.nullableString("The chat display name when returned."),
  unreadCount: s.nullableNumber("The unread message count when returned."),
  timestamp: s.nullableString("The latest chat timestamp when returned."),
  raw: rawObjectSchema,
});

const messageSchema = s.object("A normalized Unipile message.", {
  id: s.string("The Unipile message identifier."),
  providerId: s.nullableString("The upstream provider message identifier when returned."),
  chatId: s.nullableString("The chat identifier associated with the message when returned."),
  senderId: s.nullableString("The sender identifier when returned."),
  text: s.nullableString("The message text when returned."),
  timestamp: s.nullableString("The message timestamp when returned."),
  attachments: s.array("The message attachment metadata returned by Unipile.", rawObjectSchema),
  raw: rawObjectSchema,
});

const pageInfoSchema = s.object("Unipile pagination metadata.", {
  object: s.nullableString("The Unipile list object type when returned."),
  cursor: s.nullableString("The cursor for the next page when available."),
});

export const unipileActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    operationType: "read",
    description: "List accounts connected to Unipile.",
    inputSchema: s.actionInput(
      {
        cursor: cursorSchema,
        limit: limitSchema,
      },
      [],
      "The input payload for listing Unipile accounts.",
    ),
    outputSchema: s.actionOutput(
      {
        pageInfo: pageInfoSchema,
        accounts: s.array("The accounts returned by Unipile.", accountSchema),
        raw: rawObjectSchema,
      },
      "The response returned when listing Unipile accounts.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Retrieve a Unipile account by ID.",
    inputSchema: s.actionInput(
      {
        accountId: s.string({
          description: "The Unipile account ID to retrieve.",
          minLength: 1,
          pattern: "\\S",
        }),
      },
      ["accountId"],
      "The input payload for retrieving a Unipile account.",
    ),
    outputSchema: s.actionOutput(
      { account: accountSchema },
      "The response returned when retrieving a Unipile account.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_chats",
    operationType: "read",
    description: "List Unipile messaging chats with optional filters.",
    inputSchema: s.actionInput(
      {
        unread: s.boolean("Whether to return only unread or only read chats."),
        cursor: cursorSchema,
        before: isoDateTimeSchema,
        after: isoDateTimeSchema,
        limit: limitSchema,
        accountType: accountTypeSchema,
        accountId: s.string({
          description: "A Unipile account ID or comma-separated account IDs.",
          minLength: 1,
          pattern: "\\S",
        }),
      },
      [],
      "The input payload for listing Unipile chats.",
    ),
    outputSchema: s.actionOutput(
      {
        pageInfo: pageInfoSchema,
        chats: s.array("The chats returned by Unipile.", chatSchema),
        raw: rawObjectSchema,
      },
      "The response returned when listing Unipile chats.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_chat",
    operationType: "read",
    description: "Retrieve a Unipile chat by ID.",
    inputSchema: s.actionInput(
      {
        chatId: s.string({
          description: "The Unipile or provider chat ID to retrieve.",
          minLength: 1,
          pattern: "\\S",
        }),
        accountId: s.string({
          description: "The Unipile account ID, required when chatId is a provider ID.",
          minLength: 1,
          pattern: "\\S",
        }),
      },
      ["chatId"],
      "The input payload for retrieving a Unipile chat.",
    ),
    outputSchema: s.actionOutput({ chat: chatSchema }, "The response returned when retrieving a Unipile chat."),
  }),
  defineProviderAction(service, {
    name: "list_chat_messages",
    operationType: "read",
    description: "List messages from a Unipile chat.",
    inputSchema: s.actionInput(
      {
        chatId: s.string({
          description: "The Unipile chat ID whose messages should be listed.",
          minLength: 1,
          pattern: "\\S",
        }),
        cursor: cursorSchema,
        before: isoDateTimeSchema,
        after: isoDateTimeSchema,
        limit: limitSchema,
        senderId: s.string({
          description: "Only return messages from this sender ID.",
          minLength: 1,
          pattern: "\\S",
        }),
      },
      ["chatId"],
      "The input payload for listing messages from a Unipile chat.",
    ),
    outputSchema: s.actionOutput(
      {
        pageInfo: pageInfoSchema,
        messages: s.array("The messages returned by Unipile.", messageSchema),
        raw: rawObjectSchema,
      },
      "The response returned when listing Unipile chat messages.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_message",
    operationType: "read",
    description: "Retrieve a Unipile message by ID.",
    inputSchema: s.actionInput(
      {
        messageId: s.string({
          description: "The Unipile message ID to retrieve.",
          minLength: 1,
          pattern: "\\S",
        }),
      },
      ["messageId"],
      "The input payload for retrieving a Unipile message.",
    ),
    outputSchema: s.actionOutput(
      { message: messageSchema },
      "The response returned when retrieving a Unipile message.",
    ),
  }),
];
