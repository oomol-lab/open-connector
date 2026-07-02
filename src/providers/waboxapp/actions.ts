import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "waboxapp";

export type WaboxappActionName = "get_account_status" | "send_chat" | "send_image" | "send_link" | "send_media";

const sendMessageOutputSchema = s.actionOutput({
  success: s.boolean("Whether Waboxapp accepted the message submission."),
  customUid: s.string("The custom unique ID echoed back by Waboxapp for this message."),
  raw: s.looseObject("The raw Waboxapp response payload."),
});

const accountStatusSchema = s.object("Normalized Waboxapp account status fields.", {
  uid: s.string("The connected WhatsApp account phone number with international code."),
  hookUrl: s.nullable(s.string("The webhook callback URL configured for the connected account.")),
  alias: s.nullable(s.string("The display name configured for the connected account.")),
  platform: s.nullable(s.string("The smartphone platform reported by Waboxapp.")),
  batteryPercent: s.nullable(s.integer("The smartphone battery percentage reported by Waboxapp.")),
  plugged: s.nullable(s.boolean("Whether the connected smartphone is plugged in and charging.")),
  locale: s.nullable(s.string("The waboxapp web session locale.")),
  raw: s.looseObject("The raw Waboxapp status payload."),
});

const sendTargetFields = {
  to: s.nonEmptyString("The recipient phone number with international code."),
  customUid: s.nonEmptyString(
    "Your custom unique ID for this outbound message. Waboxapp echoes it back on success and ACK events.",
  ),
};

export const waboxappActions: ProviderActionDefinition<WaboxappActionName>[] = [
  defineProviderAction(service, {
    name: "get_account_status",
    description: "Fetch the current Waboxapp account status for the connected WhatsApp number.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      account: accountStatusSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "send_chat",
    description: "Send a plain text WhatsApp chat message through Waboxapp.",
    inputSchema: s.actionInput(
      {
        ...sendTargetFields,
        text: s.nonEmptyString("The text message body to send."),
      },
      ["to", "customUid", "text"],
    ),
    outputSchema: sendMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_image",
    description: "Send an image by public URL through Waboxapp.",
    inputSchema: s.actionInput(
      {
        ...sendTargetFields,
        imageUrl: s.url("The public image URL to send."),
        caption: s.nonEmptyString("The title shown on the image preview."),
        description: s.nonEmptyString("The extended description shown on the image preview."),
      },
      ["to", "customUid", "imageUrl"],
    ),
    outputSchema: sendMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_link",
    description: "Send a link with preview metadata through Waboxapp.",
    inputSchema: s.actionInput(
      {
        ...sendTargetFields,
        linkUrl: s.url("The public link URL to send."),
        caption: s.nonEmptyString("The title shown on the link preview."),
        description: s.nonEmptyString("The extended description shown on the link preview."),
        urlThumb: s.url("The thumbnail image URL shown on the link preview."),
      },
      ["to", "customUid", "linkUrl"],
    ),
    outputSchema: sendMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_media",
    description: "Send a file attachment by public URL through Waboxapp.",
    inputSchema: s.actionInput(
      {
        ...sendTargetFields,
        mediaUrl: s.url("The public file URL to send."),
        caption: s.nonEmptyString("The title shown on the file preview."),
        description: s.nonEmptyString("The extended description shown on the file preview."),
        urlThumb: s.url("The thumbnail image URL shown on the file preview."),
      },
      ["to", "customUid", "mediaUrl"],
    ),
    outputSchema: sendMessageOutputSchema,
  }),
];
