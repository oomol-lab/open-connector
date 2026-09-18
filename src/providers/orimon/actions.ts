import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const messagePayloadSchema = s.looseObject("A message returned by the Orimon chatbot.", {
  chatLogId: s.string("The Orimon chat log identifier for this exchange."),
  sessionId: s.string("The Orimon session identifier for the conversation."),
  psid: s.string("The caller-provided platform session identifier."),
  tenantId: s.string("The unique identifier of the Orimon chatbot."),
  id: s.string("The unique identifier of the returned message."),
  type: s.string("The returned message type."),
  payload: s.looseObject("The chatbot response payload.", {
    text: s.string("The chatbot response text."),
    buttons: s.array(
      "Button options configured for the chatbot response.",
      s.looseObject("A provider-defined chatbot button."),
    ),
  }),
  timestamp: s.string("The timestamp of the returned message."),
  customMessage: s.boolean("Whether the returned message is a custom chatbot message."),
});

const sendMessageOutputSchema = s.looseObject("The response returned by the Orimon Message API.", {
  status: s.string("The request status reported by Orimon."),
  message: s.string("The request result message reported by Orimon."),
  data: s.looseObject("Conversation data returned by Orimon.", {
    type: s.string("The returned event type."),
    timestamp: s.string("The timestamp of the response."),
    psid: s.string("The platform session identifier used for the conversation."),
    sessionId: s.string("The Orimon session identifier for the conversation."),
    messages: s.array("Messages returned by the chatbot.", messagePayloadSchema),
    statuses: s.array(
      "Provider-defined conversation statuses returned by Orimon.",
      s.unknown("A provider-defined conversation status."),
    ),
  }),
});

export const orimonActions: readonly ActionDefinition[] = [
  defineProviderAction("orimon", {
    name: "send_message",
    operationType: "write",
    description: "Send a text message to an Orimon chatbot and return its response.",

    requiredScopes: [],
    inputSchema: s.object(
      "A text message and conversation identifiers for an Orimon chatbot.",
      {
        tenantId: s.nonWhitespaceString("The unique ID of the target Orimon chatbot."),
        message: s.nonWhitespaceString("The text message to send to the chatbot."),
        psid: s.nonWhitespaceString(
          "A stable platform session ID used to continue a conversation. A UUID-based value is generated when omitted.",
        ),
        messageId: s.nonWhitespaceString("A unique ID for this user message. A UUID is generated when omitted."),
      },
      { optional: ["psid", "messageId"] },
    ),
    outputSchema: sendMessageOutputSchema,
  }),
];
