import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "z_api";

const phoneSchema = s.nonEmptyString("The recipient phone number with country and area codes, or a Z-API group ID.");
const delayMessageSchema = s.integer("The delay before sending the message, in seconds.", {
  minimum: 1,
  maximum: 15,
});
const messageIdSchema = s.nonEmptyString("The message ID to reply to.");
const publicUrlSchema = s.string({
  format: "uri",
  pattern: "^https?://",
  description: "The public HTTP or HTTPS image URL that Z-API should fetch and send.",
});

const sentMessageOutputSchema = s.object("Identifiers for the message accepted by Z-API.", {
  zaapId: s.string("The Z-API message ID."),
  messageId: s.string("The WhatsApp message ID."),
  id: s.string("The Zapier-compatible alias of the WhatsApp message ID."),
});

const getInstanceStatusAction = defineProviderAction(service, {
  name: "get_instance_status",
  operationType: "read",
  description: "Check whether the Z-API instance and its connected smartphone are online.",
  requiredScopes: [],
  inputSchema: s.object("No input is required to check the configured instance status.", {}),
  outputSchema: s.object("The current Z-API instance connection status.", {
    connected: s.boolean("Whether the WhatsApp account is connected to Z-API."),
    error: s.string("The current connection status detail returned by Z-API."),
    smartphoneConnected: s.boolean("Whether the connected smartphone is online."),
  }),
});

const sendTextAction = defineProviderAction(service, {
  name: "send_text",
  operationType: "write",
  description: "Send a plain-text message to a WhatsApp contact or group through Z-API.",
  requiredScopes: [],
  inputSchema: s.object(
    "The plain-text message to send.",
    {
      phone: phoneSchema,
      message: s.nonEmptyString("The message text to send."),
      delayMessage: delayMessageSchema,
      delayTyping: s.integer("How long to show the typing status before sending, in seconds.", {
        minimum: 1,
        maximum: 15,
      }),
      editMessageId: s.nonEmptyString("The ID of a previously sent text message to edit."),
    },
    { optional: ["delayMessage", "delayTyping", "editMessageId"] },
  ),
  outputSchema: sentMessageOutputSchema,
});

const sendImageAction = defineProviderAction(service, {
  name: "send_image",
  operationType: "write",
  description: "Send an image from a public URL to a WhatsApp contact or group through Z-API.",
  requiredScopes: [],
  inputSchema: s.object(
    "The URL-backed image message to send.",
    {
      phone: phoneSchema,
      imageUrl: publicUrlSchema,
      caption: s.string("The caption to send with the image."),
      messageId: messageIdSchema,
      delayMessage: delayMessageSchema,
      viewOnce: s.boolean("Whether the image can be viewed only once."),
      editImageMessageId: s.nonEmptyString("The ID of a previously sent image message whose caption should be edited."),
    },
    {
      optional: ["caption", "messageId", "delayMessage", "viewOnce", "editImageMessageId"],
    },
  ),
  outputSchema: sentMessageOutputSchema,
});

const sendLocationAction = defineProviderAction(service, {
  name: "send_location",
  operationType: "write",
  description: "Send a fixed location to a WhatsApp contact or group through Z-API.",
  requiredScopes: [],
  inputSchema: s.object(
    "The fixed location message to send.",
    {
      phone: phoneSchema,
      title: s.nonEmptyString("The location title."),
      address: s.nonEmptyString("The full street address for the location."),
      latitude: s.nonEmptyString("The location latitude as a decimal string."),
      longitude: s.nonEmptyString("The location longitude as a decimal string."),
      messageId: messageIdSchema,
      delayMessage: delayMessageSchema,
    },
    { optional: ["messageId", "delayMessage"] },
  ),
  outputSchema: sentMessageOutputSchema,
});

export const zApiActions: ActionDefinition[] = [
  getInstanceStatusAction,
  sendTextAction,
  sendImageAction,
  sendLocationAction,
];
