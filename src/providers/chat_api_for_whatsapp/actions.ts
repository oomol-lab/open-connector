import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chat_api_for_whatsapp";

const destinationFields = {
  chatId: s.nonEmptyString(
    "Chat API chat ID, such as 17633123456@c.us for a private chat or 17680561234-1479621234@g.us for a group.",
  ),
  phone: s.nonEmptyString("Recipient phone number starting with the country code, without plus sign or separators."),
};

const instanceStatusSchema = s.actionOutput(
  {
    accountStatus: s.stringEnum("Current Chat API instance status.", [
      "got qr code",
      "authenticated",
      "loading",
      "init",
      "not_paid",
    ]),
    qrCode: s.string("Base64-encoded QR code image contents, when Chat API returns one."),
    raw: s.unknownObject("Raw Chat API status response."),
  },
  "Chat API instance status response.",
  ["accountStatus", "raw"],
);

const settingsSchema = s.actionOutput(
  {
    webhookUrl: s.nullableString("Configured webhook URL, or null when none is configured."),
    ackNotificationsOn: s.nullableBoolean("Whether message acknowledgement webhooks are enabled."),
    chatUpdateOn: s.nullableBoolean("Whether chat update webhooks are enabled."),
    videoUploadOn: s.nullableBoolean("Whether incoming video upload handling is enabled."),
    proxy: s.nullableString("Configured SOCKS5 proxy, or null when none is configured."),
    raw: s.unknownObject("Raw Chat API settings response."),
  },
  "Chat API instance settings.",
);

const chatSchema = s.actionOutput(
  {
    id: s.string("Chat API chat ID."),
    name: s.string("Chat name returned by Chat API."),
    image: s.string("Avatar or group image URL returned by Chat API."),
    raw: s.unknownObject("Raw Chat API chat object."),
  },
  "One Chat API chat.",
  ["id", "name", "raw"],
);

const messageSchema = s.actionOutput(
  {
    id: s.string("Unique Chat API message ID."),
    body: s.string("Message body or media URL returned by Chat API."),
    type: s.string("Message type returned by Chat API."),
    senderName: s.string("Sender name returned by Chat API."),
    fromMe: s.boolean("Whether this message was sent by the connected account."),
    author: s.string("Author ID for group messages."),
    time: s.integer("Unix timestamp when the message was sent."),
    chatId: s.string("Chat API chat ID containing the message."),
    messageNumber: s.integer("Sequence number of the message in Chat API storage."),
    raw: s.unknownObject("Raw Chat API message object."),
  },
  "One Chat API message.",
  ["id", "body", "type", "fromMe", "time", "chatId", "messageNumber", "raw"],
);

const queuedMessageSchema = s.actionOutput(
  {
    id: s.integer("Chat API queue item ID."),
    body: s.string("Queued message body."),
    type: s.string("Queued message type."),
    lastTry: s.integer("Unix timestamp in milliseconds of the last send attempt."),
    metadata: s.unknownObject("Additional queued message metadata returned by Chat API."),
    raw: s.unknownObject("Raw Chat API queued message object."),
  },
  "One queued outbound Chat API message.",
  ["id", "body", "type", "metadata", "raw"],
);

const sendMessageStatusSchema = s.actionOutput(
  {
    sent: s.boolean("Whether Chat API accepted the message for sending."),
    id: s.string("Unique Chat API message ID when one is returned."),
    message: s.string("Posting status message returned by Chat API."),
    raw: s.unknownObject("Raw Chat API send response."),
  },
  "Chat API send message response.",
  ["sent", "raw"],
);

export const chatApiForWhatsappActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "test_api_key",
    operationType: "read",
    description: "Validate the connected Chat API token and instance ID, returning the current instance status.",
    inputSchema: s.actionInput({}, [], "No input is required to validate Chat API credentials."),
    outputSchema: instanceStatusSchema,
  }),
  defineProviderAction(service, {
    name: "get_status",
    operationType: "read",
    description: "Get the current Chat API WhatsApp instance status and QR code payload when authorization is pending.",
    inputSchema: s.actionInput({}, [], "No input is required to retrieve Chat API status."),
    outputSchema: instanceStatusSchema,
  }),
  defineProviderAction(service, {
    name: "get_settings",
    operationType: "read",
    description: "Get the current webhook, notification, video upload, and proxy settings.",
    inputSchema: s.actionInput({}, [], "No input is required to retrieve Chat API settings."),
    outputSchema: settingsSchema,
  }),
  defineProviderAction(service, {
    name: "list_chats",
    operationType: "read",
    description: "List chats known to the connected Chat API WhatsApp instance.",
    inputSchema: s.actionInput({}, [], "No input is required to list Chat API chats."),
    outputSchema: s.actionOutput(
      {
        chats: s.array("Chats returned by Chat API.", chatSchema),
      },
      "Chat API chat listing response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_messages",
    operationType: "read",
    description:
      "List incoming and outgoing messages, optionally filtered by chat ID or paged from a previous response.",
    inputSchema: s.actionInput(
      {
        lastMessageNumber: s.nonNegativeInteger("The lastMessageNumber value from a previous list_messages response."),
        last: s.boolean("Whether to request the last 100 messages and ignore lastMessageNumber."),
        chatId: s.nonEmptyString("Optional Chat API chat ID to filter messages by."),
      },
      [],
      "Parameters for listing Chat API messages.",
    ),
    outputSchema: s.actionOutput(
      {
        messages: s.array("Messages returned by Chat API.", messageSchema),
        lastMessageNumber: s.integer("The value to pass as lastMessageNumber on the next request."),
      },
      "Chat API message listing response.",
      ["messages"],
    ),
  }),
  defineProviderAction(service, {
    name: "send_text_message",
    operationType: "write",
    description: "Send a text message to an existing Chat API chat ID or to a phone number.",
    inputSchema: destinationInput(
      {
        ...destinationFields,
        text: s.nonEmptyString("Message text to send."),
      },
      ["text"],
      "Parameters for sending a text message with Chat API.",
    ),
    outputSchema: sendMessageStatusSchema,
  }),
  defineProviderAction(service, {
    name: "send_file_by_url",
    operationType: "write",
    description: "Send a file using a public URL to an existing Chat API chat ID or to a phone number.",
    inputSchema: destinationInput(
      {
        ...destinationFields,
        fileUrl: s.url("Public HTTP or HTTPS URL of the file Chat API should send."),
        filename: s.nonEmptyString("File name to show in WhatsApp, such as invoice.pdf."),
        caption: s.nonEmptyString("Optional text caption to show under the file."),
      },
      ["fileUrl", "filename"],
      "Parameters for sending a file by URL with Chat API.",
    ),
    outputSchema: sendMessageStatusSchema,
  }),
  defineProviderAction(service, {
    name: "list_messages_queue",
    operationType: "read",
    description: "List outbound messages currently waiting in the Chat API send queue.",
    inputSchema: s.actionInput({}, [], "No input is required to list the Chat API message queue."),
    outputSchema: s.actionOutput(
      {
        totalMessages: s.nonNegativeInteger("Total number of outbound messages in the queue."),
        first100: s.array("The first 100 queued outbound messages returned by Chat API.", queuedMessageSchema),
      },
      "Chat API outbound message queue response.",
    ),
  }),
];

function destinationInput(properties: Record<string, JsonSchema>, required: string[], description: string): JsonSchema {
  return {
    ...s.actionInput(properties, required, description),
    oneOf: [
      {
        required: ["chatId"],
        not: { required: ["phone"] },
      },
      {
        required: ["phone"],
        not: { required: ["chatId"] },
      },
    ],
  };
}
