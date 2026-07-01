import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bark";

const barkResultSchema = s.object(
  "The normalized Bark response returned after a push request.",
  {
    code: s.integer("The Bark response code. Successful requests usually return 200."),
    message: s.string("The Bark response message."),
    timestamp: s.integer("The Bark server timestamp for the response."),
  },
  { optional: ["timestamp"] },
);
const notificationFields = {
  title: s.nonEmptyString("Optional notification title shown above the body."),
  subtitle: s.nonEmptyString("Optional notification subtitle."),
  body: s.nonEmptyString("Notification body text to send to the Bark device."),
  level: s.stringEnum("Optional iOS interruption level for the notification.", [
    "critical",
    "active",
    "timeSensitive",
    "passive",
  ]),
  volume: s.nonEmptyString("Optional ringtone volume for critical alert notifications."),
  badge: s.integer("Optional badge number displayed next to the Bark app icon."),
  call: s.boolean("Whether the ringtone should continue to play for 30 seconds."),
  autoCopy: s.boolean("Whether Bark should automatically copy the notification content."),
  copy: s.nonEmptyString("Optional text value Bark should copy."),
  sound: s.nonEmptyString("Optional Bark sound name or custom ringtone name."),
  icon: s.url("Optional icon URL shown with the notification on supported iOS versions."),
  group: s.nonEmptyString("Optional notification group name."),
  isArchive: s.boolean("Whether Bark should archive the notification in the app."),
  url: s.url("Optional URL opened when the user taps the notification."),
  action: s.stringEnum("Optional tap behavior for the notification.", ["none", "alert"]),
};
const optionalNotificationFields = [
  "title",
  "subtitle",
  "level",
  "volume",
  "badge",
  "call",
  "autoCopy",
  "copy",
  "sound",
  "icon",
  "group",
  "isArchive",
  "url",
  "action",
];

export const barkActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_notification",
    description: "Send a notification to the connected Bark device through the REST push endpoint.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for sending one Bark notification.", notificationFields, {
      optional: optionalNotificationFields,
    }),
    outputSchema: barkResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_batch_notifications",
    description: "Send the same notification to multiple explicit Bark device keys through the REST push endpoint.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for sending one Bark notification to multiple device keys.",
      {
        device_keys: s.stringArray("The Bark device keys that should receive this notification.", {
          minItems: 1,
          itemDescription: "One Bark device key. This value is sensitive.",
        }),
        ...notificationFields,
      },
      { optional: optionalNotificationFields },
    ),
    outputSchema: barkResultSchema,
  }),
  defineProviderAction(service, {
    name: "send_encrypted_notification",
    description: "Send a pre-encrypted Bark notification ciphertext to the connected Bark device.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for sending one encrypted Bark notification.", {
      ciphertext: s.nonEmptyString("The already-encrypted Bark ciphertext payload to forward."),
    }),
    outputSchema: barkResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_server_info",
    description: "Fetch raw server information from the connected Bark server.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching Bark server information.", {}),
    outputSchema: s.object("The wrapped Bark server information response.", {
      raw: s.unknown("The raw payload returned by the Bark server info endpoint."),
    }),
  }),
];

export type BarkActionName = (typeof barkActions)[number]["name"];
