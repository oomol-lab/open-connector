import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pushsafer";

const targetSchema = s.object("One Pushsafer delivery target.", {
  id: s.string("The Pushsafer device or group identifier."),
  name: s.string("The human-readable device or group name."),
});

export const pushsaferActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a push notification to one Pushsafer device, group, or all devices.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for sending a Pushsafer notification.",
      {
        message: s.nonEmptyString("The notification message text, limited to 5000 characters.", {
          maxLength: 5000,
        }),
        title: s.nonEmptyString("The optional notification title, limited to 255 characters.", {
          maxLength: 255,
        }),
        target: s.nonEmptyString(
          "The optional device or group id. Use a for all devices, a numeric device id, or a gs-prefixed group id.",
        ),
        sound: s.integer("The optional Pushsafer sound number from 0 through 62.", {
          minimum: 0,
          maximum: 62,
        }),
        vibration: s.integer("The optional vibration count from 1 through 3.", {
          minimum: 1,
          maximum: 3,
        }),
        icon: s.integer("The optional Pushsafer icon number from 1 through 181.", {
          minimum: 1,
          maximum: 181,
        }),
        iconColor: s.nonEmptyString("The optional hexadecimal icon color, such as #FF0000."),
        url: s.nonEmptyString("The optional URL or application URL scheme opened from the notification."),
        urlTitle: s.nonEmptyString("The optional display title for the notification URL."),
        timeToLive: s.integer("The optional number of minutes to retain the message, from 0 through 43200.", {
          minimum: 0,
          maximum: 43200,
        }),
        priority: s.integer("The optional notification priority from -2 through 2.", {
          minimum: -2,
          maximum: 2,
        }),
      },
      {
        optional: [
          "title",
          "target",
          "sound",
          "vibration",
          "icon",
          "iconColor",
          "url",
          "urlTitle",
          "timeToLive",
          "priority",
        ],
      },
    ),
    outputSchema: s.object("The normalized Pushsafer message delivery result.", {
      success: s.string("The success message returned by Pushsafer."),
      availableCalls: s.integer("The number of API calls remaining on the account."),
      deliveries: s.array(
        "The message and device identifiers returned for each delivery.",
        s.object("One Pushsafer message delivery.", {
          messageId: s.string("The Pushsafer message identifier."),
          deviceId: s.string("The target Pushsafer device identifier."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_devices",
    description: "List devices and device groups registered to the connected Pushsafer account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Pushsafer devices.", {}),
    outputSchema: s.object("The normalized Pushsafer device list.", {
      devices: s.array("The registered Pushsafer delivery targets.", targetSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List delivery groups registered to the connected Pushsafer account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Pushsafer groups.", {}),
    outputSchema: s.object("The normalized Pushsafer group list.", {
      groups: s.array(
        "The registered Pushsafer delivery groups.",
        s.object("One Pushsafer delivery group.", {
          id: s.string("The Pushsafer group identifier."),
          name: s.string("The human-readable group name."),
          deviceIds: s.array(
            "The device identifiers assigned to the group.",
            s.string("One Pushsafer device identifier."),
          ),
        }),
      ),
    }),
  }),
];
