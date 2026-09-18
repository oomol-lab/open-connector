import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "line" as const;

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const textMessagesSchema = s.array(
  "The text messages to send in order.",
  s.string("A non-empty text message preserved exactly as provided.", {
    minLength: 1,
    maxLength: 5000,
  }),
  { minItems: 1, maxItems: 5 },
);

const sendOptions = {
  texts: textMessagesSchema,
  notificationDisabled: s.boolean("Whether LINE should suppress push notifications for the sent messages."),
  retryKey: s.uuid("An optional caller-generated UUID used by LINE to deduplicate a retried request."),
};

const sentMessageSchema = s.object(
  "A message accepted by LINE.",
  {
    id: s.string("The message identifier assigned by LINE."),
    quoteToken: s.string("The token that can be used to quote this message."),
  },
  { optional: ["quoteToken"] },
);

export const lineActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_bot_info",
    operationType: "read",
    description: "Get profile and chat settings for the connected LINE Official Account.",
    inputSchema: s.requiredObject("The empty input for reading LINE bot information.", {}),
    outputSchema: s.object(
      "The connected LINE Official Account information.",
      {
        userId: s.string("The LINE user ID of the bot."),
        basicId: s.string("The basic ID of the LINE Official Account."),
        premiumId: s.string("The premium ID when one is configured."),
        displayName: s.string("The display name of the LINE Official Account."),
        pictureUrl: s.url("The HTTPS profile image URL when one is configured."),
        chatMode: s.stringEnum("The configured LINE Official Account chat mode.", ["chat", "bot"]),
        markAsReadMode: s.stringEnum("The automatic read setting for received messages.", ["auto", "manual"]),
      },
      { optional: ["premiumId", "pictureUrl"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_profile",
    operationType: "read",
    description: "Get the LINE profile of a user who can interact with the connected bot.",
    inputSchema: s.requiredObject("The LINE user profile lookup.", {
      userId: nonEmptyString("The LINE user ID obtained from a Messaging API webhook."),
    }),
    outputSchema: s.object(
      "The LINE user's available profile information.",
      {
        displayName: s.string("The user's LINE display name."),
        userId: s.string("The LINE user ID."),
        language: s.string("The user's BCP 47 language tag when consent permits it."),
        pictureUrl: s.url("The user's HTTPS profile image URL when one is configured."),
        statusMessage: s.string("The user's status message when one is configured."),
      },
      { optional: ["language", "pictureUrl", "statusMessage"] },
    ),
  }),
  defineProviderAction(service, {
    name: "send_push_text",
    operationType: "write",
    description: "Send up to five text messages to one LINE user, group, or multi-person chat.",
    inputSchema: s.object(
      "The LINE push text request.",
      {
        to: nonEmptyString("The target LINE user, group, or room ID."),
        ...sendOptions,
      },
      { optional: ["notificationDisabled", "retryKey"] },
    ),
    outputSchema: s.requiredObject("The messages accepted by LINE.", {
      sentMessages: s.array("The accepted LINE messages.", sentMessageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "send_multicast_text",
    operationType: "write",
    description: "Send up to five text messages to as many as 500 LINE users.",
    inputSchema: s.object(
      "The LINE multicast text request.",
      {
        to: s.array("The target LINE user IDs.", nonEmptyString("A LINE user ID obtained from the Messaging API."), {
          minItems: 1,
          maxItems: 500,
        }),
        ...sendOptions,
      },
      { optional: ["notificationDisabled", "retryKey"] },
    ),
    outputSchema: s.requiredObject("LINE's empty multicast success response.", {}),
  }),
  defineProviderAction(service, {
    name: "send_broadcast_text",
    operationType: "write",
    description: "Send up to five text messages to all friends of the LINE Official Account.",
    inputSchema: s.object("The LINE broadcast text request.", sendOptions, {
      optional: ["notificationDisabled", "retryKey"],
    }),
    outputSchema: s.requiredObject("LINE's empty broadcast success response.", {}),
  }),
];

export type LineActionName =
  | "get_bot_info"
  | "get_profile"
  | "send_push_text"
  | "send_multicast_text"
  | "send_broadcast_text";
