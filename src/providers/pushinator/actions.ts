import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
export const pushinatorActions: ActionDefinition[] = [
  defineProviderAction("pushinator", {
    name: "send_notification",
    operationType: "write",
    description: "Send a push notification to the subscribers of a Pushinator channel.",
    requiredScopes: [],
    inputSchema: s.object(
      "The notification to send.",
      {
        channel_id: s.string("The UUID of the channel to send the notification to.", {
          format: "uuid",
        }),
        content: s.nonEmptyString("The message content of the notification."),
        acknowledgment_required: s.optional(
          s.boolean(
            "Whether subscriber acknowledgment is required. Defaults to false; treated as false on the Free plan. Unacknowledged notifications retry up to five times with exponential backoff.",
          ),
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.looseRequiredObject("The notification submission result, not a delivery receipt.", {
      success: s.boolean("Whether Pushinator accepted the notification."),
      message: s.string("The human-readable response message."),
    }),
  }),
  defineProviderAction("pushinator", {
    name: "create_channel",
    operationType: "write",
    description: "Create a Pushinator channel for notification subscribers.",
    requiredScopes: [],
    inputSchema: s.object(
      "The channel to create.",
      {
        name: s.nonEmptyString("The name of the channel."),
        description: s.optional(s.string("The description of the channel.")),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The created channel result.",
      {
        channel: s.looseObject("The channel properties returned by Pushinator, preserved without renaming."),
      },
      { optional: [] },
    ),
  }),
];
