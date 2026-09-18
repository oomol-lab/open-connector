import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "trent";

const clientInfoSchema = s.object(
  "Client metadata sent to Trent for attribution and troubleshooting.",
  {
    client_type: s.nonEmptyString("The client type identifier sent to Trent."),
    client_version: s.nonEmptyString("The client version string sent to Trent."),
  },
  { optional: ["client_type", "client_version"] },
);

const chatInputSchema = s.object(
  "Input for sending one message to the Trent chat endpoint.",
  {
    message: s.nonEmptyString("The chat message or audit prompt to send to Trent."),
    context: s.nonEmptyString("Optional context string sent with the message."),
    thread_id: s.nonEmptyString("Optional Trent thread ID for continuing an existing conversation."),
    client_info: clientInfoSchema,
  },
  { optional: ["context", "thread_id", "client_info"] },
);

const chatOutputSchema = s.object("The normalized Trent chat response returned by the connector.", {
  content: s.string("The complete response content assembled from Trent response chunks."),
  thread_id: s.nullable(s.string("The Trent thread ID returned by the endpoint.")),
  expiration_warning: s.nullable(s.string("Advisory API-key expiration warning returned by Trent response headers.")),
  raw: s.array(
    "Raw event payloads received from Trent while assembling the response.",
    s.unknown("One parsed Trent response event payload."),
  ),
});

export const trentActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_chat",
    operationType: "write",
    description:
      "Send one message to Trent's chat endpoint and return the assembled response content plus thread metadata.",
    requiredScopes: [],
    inputSchema: chatInputSchema,
    outputSchema: chatOutputSchema,
  }),
];
