import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "timelinesai";

const trimmedString = (description: string, maxLength?: number) =>
  s.nonEmptyString(description, {
    ...(maxLength === undefined ? {} : { maxLength }),
  });

const quotaSchema = s.object("A normalized TimelinesAI quota allocation.", {
  total: s.integer("The total allocation for the current quota period."),
  used: s.integer("The amount consumed in the current quota period."),
  periodStart: s.nullable(s.string("The start timestamp of the quota period, when available.")),
  periodEnd: s.nullable(s.string("The end timestamp of the quota period, when available.")),
});

const workspaceSchema = s.object("A normalized TimelinesAI workspace.", {
  workspaceId: s.string("The unique TimelinesAI workspace slug."),
  displayName: s.string("The human-readable TimelinesAI workspace name."),
  plan: s.string("The current TimelinesAI subscription plan."),
  seats: s.nullable(s.describe(quotaSchema, "The workspace seat quota, when reported.")),
  messagingQuota: s.describe(quotaSchema, "The current workspace messaging quota."),
  apiCallsQuota: s.describe(quotaSchema, "The current workspace API call quota."),
  nonRecurringQuota: s.nullable(
    s.object("The optional one-off messaging quota balance.", {
      remainingBalance: s.nullable(
        s.integer("The remaining one-off quota balance, or null when TimelinesAI omits it."),
      ),
      lastUpdatedAt: s.nullable(s.string("The timestamp when the one-off quota balance was last updated.")),
    }),
  ),
  raw: s.unknownObject("The raw TimelinesAI workspace payload."),
});

const whatsappAccountSchema = s.object("A normalized connected WhatsApp account.", {
  id: s.string("The WhatsApp account identifier in WID format."),
  phone: s.string("The connected WhatsApp phone number in international format."),
  connectedOn: s.string("The timestamp when the WhatsApp account was connected."),
  status: s.string("The current TimelinesAI connection status."),
  ownerName: s.string("The name of the TimelinesAI teammate who owns the account."),
  ownerEmail: s.string("The email of the TimelinesAI teammate who owns the account."),
  accountName: s.string("The WhatsApp profile name, or an empty string when unset."),
  raw: s.unknownObject("The raw TimelinesAI WhatsApp account payload."),
});

const chatSchema = s.object("A normalized TimelinesAI chat with its stable routing and state fields.", {
  id: s.integer("The TimelinesAI chat ID."),
  name: s.string("The display name of the chat or group."),
  phone: s.nullable(s.string("The contact phone number, or null when this is a group chat.")),
  jid: s.string("The WhatsApp-native contact or group identifier."),
  isGroup: s.boolean("Whether this is a WhatsApp group chat."),
  closed: s.boolean("Whether the chat is closed."),
  read: s.boolean("Whether the chat is marked as read."),
  labels: s.array("The labels assigned to the chat.", s.string("One chat label.")),
  chatgptAutoresponseEnabled: s.boolean("Whether the TimelinesAI AI Agent autoresponse is enabled for the chat."),
  responsibleEmail: s.nullable(s.string("The assigned teammate email, or null when the chat is unassigned.")),
  responsibleName: s.nullable(s.string("The assigned teammate name, or null when the chat is unassigned.")),
  whatsappAccountId: s.string("The WID of the WhatsApp account that owns the chat."),
  chatUrl: s.string("The TimelinesAI application URL for the chat."),
  createdTimestamp: s.string("The chat creation timestamp in the workspace timezone."),
  lastMessageUid: s.nullable(s.string("The UID of the latest message, or null when unavailable.")),
  lastMessageTimestamp: s.nullable(s.string("The latest message timestamp, or null when unavailable.")),
  unattended: s.boolean("Whether the chat is flagged as an unattended customer chat."),
  photo: s.nullable(s.string("The contact or group photo URL, or null when unavailable.")),
  isAllowedToMessage: s.nullable(s.boolean("Whether TimelinesAI currently allows API messages to this chat.")),
  raw: s.unknownObject("The raw TimelinesAI chat payload."),
});

const messageSchema = s.object("A normalized TimelinesAI message.", {
  uid: s.string("The message UID within the TimelinesAI workspace."),
  chatId: s.integer("The TimelinesAI chat ID containing the message."),
  timestamp: s.string("The WhatsApp message creation timestamp."),
  receivedTimestamp: s.string("The timestamp when TimelinesAI received the message."),
  senderPhone: s.string("The sender phone number."),
  senderName: s.string("The sender display name."),
  recipientPhone: s.string("The recipient phone number."),
  recipientName: s.string("The recipient display name."),
  fromMe: s.boolean("Whether the message was sent from a connected WhatsApp account."),
  text: s.nullable(s.string("The message text, or null for messages without text.")),
  attachmentUrl: s.nullable(s.string("The attachment URL, or null when the message has no attachment.")),
  attachmentFilename: s.nullable(s.string("The attachment filename, or null when the message has no attachment.")),
  status: s.string("The delivery or call status reported by TimelinesAI."),
  origin: s.string("The open-ended display name for the message origin."),
  hasAttachment: s.boolean("Whether the message has an attachment."),
  messageType: s.string("The TimelinesAI message type."),
  metadata: s.unknownObject("Free-form metadata whose shape depends on the message type."),
  createdBy: s.string("The teammate who created the message, or an empty string."),
  raw: s.unknownObject("The raw TimelinesAI message payload."),
});

const messageUidField = trimmedString("The TimelinesAI message UID.");
const chatIdField = s.integer("The TimelinesAI chat ID.", { minimum: 1 });
const sendOutputSchema = s.object("A normalized TimelinesAI message submission result.", {
  messageUid: s.string("The UID assigned to the accepted outbound message."),
});
const messageStatusFollowUp = ["timelinesai.get_message_status"];

export const timelinesAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_workspace",
    operationType: "read",
    description: "Get the connected TimelinesAI workspace identity, plan, and quota usage.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to get the TimelinesAI workspace.", {}),
    outputSchema: s.object("The connected TimelinesAI workspace response.", {
      workspace: workspaceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_whatsapp_accounts",
    operationType: "read",
    description: "List WhatsApp accounts connected to the TimelinesAI workspace.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list connected WhatsApp accounts.", {}),
    outputSchema: s.object("The connected WhatsApp account list.", {
      accounts: s.array("The connected WhatsApp accounts.", whatsappAccountSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_chats",
    operationType: "read",
    description: "List and filter chats in the TimelinesAI workspace, 50 records per page.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and page selection for listing TimelinesAI chats.",
      {
        labels: s.array("Match chats having at least one of these labels.", trimmedString("One label."), {
          minItems: 1,
        }),
        whatsappAccountIds: s.array(
          "Match chats belonging to any of these WhatsApp account WIDs.",
          trimmedString("One WhatsApp account WID."),
          { minItems: 1 },
        ),
        group: s.boolean("Filter group chats when true or direct chats when false."),
        responsibleEmails: s.array(
          "Match chats assigned to any of these teammate emails.",
          trimmedString("One responsible teammate email."),
          { minItems: 1 },
        ),
        names: s.array(
          "Match chats containing any of these case-insensitive name fragments.",
          trimmedString("One chat name fragment."),
          { minItems: 1 },
        ),
        phone: trimmedString("Filter direct chats by one phone number."),
        read: s.boolean("Filter chats by read state."),
        closed: s.boolean("Filter chats by closed state."),
        chatgptAutoresponseEnabled: s.boolean("Filter chats by TimelinesAI AI Agent autoresponse state."),
        page: s.integer("The one-based results page, with up to 50 chats per page.", {
          minimum: 1,
        }),
        createdAfter: s.dateTime("Return chats created after this timestamp."),
        createdBefore: s.dateTime("Return chats created before this timestamp."),
      },
      {
        optional: [
          "labels",
          "whatsappAccountIds",
          "group",
          "responsibleEmails",
          "names",
          "phone",
          "read",
          "closed",
          "chatgptAutoresponseEnabled",
          "page",
          "createdAfter",
          "createdBefore",
        ],
      },
    ),
    outputSchema: s.object("A page of normalized TimelinesAI chats.", {
      hasMorePages: s.boolean("Whether another page of chats is available."),
      chats: s.array("The chats returned on this page.", chatSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_chat",
    operationType: "read",
    description: "Get one TimelinesAI chat by its numeric chat ID.",
    requiredScopes: [],
    inputSchema: s.object("The TimelinesAI chat to retrieve.", { chatId: chatIdField }),
    outputSchema: s.object("The normalized TimelinesAI chat response.", {
      chat: chatSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_chat_messages",
    operationType: "read",
    description: "List and filter messages in one TimelinesAI chat, 50 records per page.",
    requiredScopes: [],
    inputSchema: s.object(
      "The chat and optional filters for listing TimelinesAI messages.",
      {
        chatId: chatIdField,
        fromMe: s.boolean("Filter outbound messages when true or inbound messages when false."),
        after: trimmedString("Return messages created on or after this ISO date or timestamp."),
        before: trimmedString("Return messages created on or before this ISO date or timestamp."),
        afterMessage: messageUidField,
        beforeMessage: messageUidField,
        sortingOrder: s.stringEnum("The message timestamp sort direction.", ["asc", "desc"]),
      },
      {
        optional: ["fromMe", "after", "before", "afterMessage", "beforeMessage", "sortingOrder"],
      },
    ),
    outputSchema: s.object("A page of normalized TimelinesAI messages.", {
      hasMorePages: s.boolean("Whether another message page is available."),
      messages: s.array("The messages returned for the chat.", messageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_message",
    operationType: "read",
    description: "Get one TimelinesAI message by its workspace-unique UID.",
    requiredScopes: [],
    inputSchema: s.object("The TimelinesAI message to retrieve.", {
      messageUid: messageUidField,
    }),
    outputSchema: s.object("The normalized TimelinesAI message response.", {
      message: messageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_message_status",
    operationType: "read",
    description: "Get the documented delivery status history for one TimelinesAI message.",
    requiredScopes: [],
    inputSchema: s.object("The TimelinesAI message whose status history should be read.", {
      messageUid: messageUidField,
    }),
    outputSchema: s.object("The TimelinesAI message status history.", {
      history: s.array(
        "The status records returned by TimelinesAI.",
        s.object("One TimelinesAI message status record.", {
          status: s.string("The message delivery status."),
          timestamp: s.string("The timestamp when the message entered this status."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "send_message_to_chat",
    operationType: "write",
    description: "Send a plain-text WhatsApp message to an existing TimelinesAI chat or group.",
    requiredScopes: [],
    followUpActions: messageStatusFollowUp,
    inputSchema: s.object(
      "The existing chat and text payload for a TimelinesAI outbound message.",
      {
        chatId: chatIdField,
        text: trimmedString("The plain-text WhatsApp message, up to 2000 characters.", 2000),
        replyTo: trimmedString("The UID of a message in the same WhatsApp account to reply to."),
      },
      { optional: ["replyTo"] },
    ),
    outputSchema: sendOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_message_to_phone",
    operationType: "write",
    description: "Send a plain-text WhatsApp message directly to an international phone number.",
    requiredScopes: [],
    followUpActions: messageStatusFollowUp,
    inputSchema: s.object(
      "The recipient and text payload for a TimelinesAI outbound message.",
      {
        phone: trimmedString("The recipient phone number in international format, including country code."),
        text: trimmedString("The plain-text WhatsApp message, up to 2000 characters.", 2000),
        whatsappAccountPhone: trimmedString(
          "The connected WhatsApp account phone to send from; omit to use the most recently connected account.",
        ),
      },
      { optional: ["whatsappAccountPhone"] },
    ),
    outputSchema: sendOutputSchema,
  }),
];
