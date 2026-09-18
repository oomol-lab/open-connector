import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "whatsable";
const detailsSchema = s.looseObject("Additional message delivery details returned by WhatsAble.", {
  messages: s.array(
    "WhatsApp messages accepted by the upstream service.",
    s.object("A WhatsApp message accepted by WhatsAble.", {
      id: s.string("The WhatsApp message ID."),
      message_status: s.string("The acceptance status of the WhatsApp message."),
    }),
  ),
});

export const whatsableActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_message",
    operationType: "write",
    description: "Send one WhatsApp text message with an optional attachment URL through WhatsAble.",
    inputSchema: s.object(
      "The recipient, message text, and optional public attachment sent through WhatsAble.",
      {
        to: s.nonEmptyString("The recipient phone number in E.164 format, including the leading plus sign."),
        text: s.nonEmptyString("The text content of the WhatsApp message."),
        attachment: s.string({
          description: "A public HTTP or HTTPS URL that WhatsAble can fetch as an attachment.",
          format: "uri",
          pattern: "^https?://",
        }),
        filename: s.nonEmptyString("The filename shown for a document attachment."),
      },
      { required: ["to", "text"] },
    ),
    outputSchema: s.object("The WhatsAble acceptance response for the submitted message.", {
      success: s.boolean("Whether WhatsAble accepted the message request."),
      message: s.string("A human-readable summary of the submission result."),
      details: detailsSchema,
    }),
  }),
];
