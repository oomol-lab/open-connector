import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "push_by_techulus";

const pushByTechulusSoundValues = [
  "default",
  "arcade",
  "correct",
  "fail",
  "harp",
  "reveal",
  "bubble",
  "doorbell",
  "flute",
  "money",
  "scifi",
  "clear",
  "elevator",
  "guitar",
  "pop",
];

const notificationFields = {
  title: s.nonEmptyString("The notification title shown on recipient devices."),
  body: s.nonEmptyString("The notification body text shown on recipient devices."),
  sound: s.stringEnum("The notification sound name documented by Push by Techulus.", pushByTechulusSoundValues),
  channel: s.string({
    description:
      "The alphanumeric notification channel identifier. Hyphens are allowed, and Push by Techulus defaults it to feed.",
    minLength: 1,
    pattern: "^[A-Za-z0-9-]+$",
  }),
  link: s.url("The URL to open when the recipient taps the notification."),
  image: s.url("The image URL to show with the notification."),
  timeSensitive: s.boolean("Whether iOS should deliver the notification immediately even in Do Not Disturb mode."),
};

const notificationOptionalFields = ["sound", "channel", "link", "image", "timeSensitive"] as const;

const sendNotificationInputSchema = s.object(
  "The Push by Techulus notification to send to all devices targeted by the API key.",
  notificationFields,
  { required: ["title", "body"], optional: notificationOptionalFields },
);

const sendGroupNotificationInputSchema = s.object(
  "The Push by Techulus notification to send to a device group.",
  {
    groupId: s.nonEmptyString("The Push by Techulus device group ID used in the request path."),
    ...notificationFields,
  },
  { required: ["groupId", "title", "body"], optional: notificationOptionalFields },
);

const deviceResponseSchema = s.object(
  "A per-device notification response returned by Push by Techulus.",
  {
    success: s.boolean("Whether this individual device notification succeeded."),
    message: s.string("The message returned for this individual device notification."),
  },
  { required: ["success", "message"] },
);

const successOutputSchema = s.object(
  "The Push by Techulus response for a notification request.",
  {
    success: s.boolean("Whether Push by Techulus accepted the notification request."),
    message: s.string("The response message returned by Push by Techulus."),
    responses: s.array("Per-device responses returned by Push by Techulus when available.", deviceResponseSchema),
  },
  { required: ["success"], optional: ["message", "responses"] },
);

export const pushByTechulusActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_notification",
    description: "Send a Push by Techulus notification to all devices targeted by the account or team API key.",
    inputSchema: sendNotificationInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_group_notification",
    description: "Send a Push by Techulus notification to a specific device group.",
    inputSchema: sendGroupNotificationInputSchema,
    outputSchema: successOutputSchema,
  }),
];
