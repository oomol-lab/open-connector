import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "onesignal_rest_api";

const nullSchema: JsonSchema = {
  type: "null",
  description: "The response does not include this field.",
};

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const nonEmptyStringArray = (description: string, itemDescription: string): JsonSchema =>
  s.array(description, s.nonEmptyString(itemDescription), { minItems: 1 });
const localizedTextObject = (description: string): JsonSchema =>
  s.record(description, s.nonEmptyString("The localized text value for one language key."));

const messageIdSchema = nonEmptyString("The OneSignal message identifier.");
const templateIdSchema = nonEmptyString("The OneSignal template UUID.");
const templateKindSchema = s.union([s.literal(0), s.literal(1), s.literal(3)], {
  description: "The OneSignal message kind filter: 0 for API-created, 1 for automated, or 3 for journey.",
});

const targetingAliasesSchema = s.record(
  "Mapping of OneSignal alias labels to one or more alias values.",
  nonEmptyStringArray("The alias values for one alias label.", "A single OneSignal alias value."),
);

const filtersSchema = s.array(
  "OneSignal filter objects used as the targeting method.",
  s.looseObject("One OneSignal filter or operator object."),
  { minItems: 1 },
);

const commonMessageSchema = s.object(
  "A OneSignal message object returned by the upstream API.",
  {
    id: nonEmptyString("The OneSignal message identifier."),
    app_id: nonEmptyString("The OneSignal app UUID attached to the message."),
    name: nonEmptyString("The message name when OneSignal includes it."),
    queued_at: s.integer("Unix timestamp when the message was queued."),
    send_after: nonEmptyString("The scheduled delivery time string returned by OneSignal."),
    completed_at: s.integer("Unix timestamp when the message finished processing."),
    canceled: s.boolean("Whether the message has been canceled."),
    contents: localizedTextObject("The localized message body returned by OneSignal."),
    headings: localizedTextObject("The localized message title returned by OneSignal."),
    subtitle: localizedTextObject("The localized message subtitle returned by OneSignal."),
    included_segments: nonEmptyStringArray(
      "Included OneSignal segments attached to the message.",
      "One included segment name.",
    ),
    excluded_segments: nonEmptyStringArray(
      "Excluded OneSignal segments attached to the message.",
      "One excluded segment name.",
    ),
    include_aliases: targetingAliasesSchema,
    include_subscription_ids: nonEmptyStringArray(
      "Included subscription ids attached to the message.",
      "One OneSignal subscription id.",
    ),
    filters: filtersSchema,
    template_id: templateIdSchema,
    url: nonEmptyString("The URL attached to the message."),
    web_url: nonEmptyString("The web URL attached to the message."),
    app_url: nonEmptyString("The app URL attached to the message."),
    data: s.looseObject("Custom push data attached to the message."),
    custom_data: s.looseObject("Template custom data attached to the message."),
    successful: s.integer("The number of successful deliveries recorded by OneSignal."),
    failed: s.integer("The number of failed deliveries recorded by OneSignal."),
    received: s.integer("The number of received deliveries recorded by OneSignal."),
    errored: s.integer("The number of errored deliveries recorded by OneSignal."),
    converted: s.integer("The number of conversions recorded by OneSignal."),
    remaining: s.integer("The number of remaining deliveries recorded by OneSignal."),
    platform_delivery_stats: s.looseObject("Platform-specific delivery metrics returned by OneSignal."),
    outcomes: s.looseObject("Outcome metrics returned by OneSignal."),
  },
  {
    optional: [
      "name",
      "queued_at",
      "send_after",
      "completed_at",
      "canceled",
      "contents",
      "headings",
      "subtitle",
      "included_segments",
      "excluded_segments",
      "include_aliases",
      "include_subscription_ids",
      "filters",
      "template_id",
      "url",
      "web_url",
      "app_url",
      "data",
      "custom_data",
      "successful",
      "failed",
      "received",
      "errored",
      "converted",
      "remaining",
      "platform_delivery_stats",
      "outcomes",
    ],
    additionalProperties: true,
  },
);

const createPushNotificationInputSchema = s.object(
  "Core OneSignal push notification fields. The connector injects app_id from the connected credential and allows additional official request keys.",
  {
    contents: localizedTextObject("Localized push notification body keyed by language code."),
    headings: localizedTextObject("Localized push notification title keyed by language code."),
    subtitle: localizedTextObject("Localized push notification subtitle keyed by language code."),
    name: nonEmptyString("Optional OneSignal message name."),
    included_segments: nonEmptyStringArray(
      "Segments targeted by this push notification.",
      "One included segment name.",
    ),
    excluded_segments: nonEmptyStringArray("Segments explicitly excluded from delivery.", "One excluded segment name."),
    include_aliases: targetingAliasesSchema,
    include_subscription_ids: nonEmptyStringArray(
      "Direct subscription ids targeted by this push notification.",
      "One OneSignal subscription id.",
    ),
    filters: filtersSchema,
    template_id: templateIdSchema,
    send_after: nonEmptyString("Scheduled delivery time string accepted by OneSignal."),
    url: nonEmptyString("Optional URL to open from the notification."),
    web_url: nonEmptyString("Optional web URL to open from the notification."),
    app_url: nonEmptyString("Optional app deep link to open from the notification."),
    data: s.looseObject("Custom push data included in the message payload."),
    custom_data: s.looseObject("Template personalization data included in the request."),
    content_available: s.boolean("Whether to set content_available for silent delivery."),
  },
  {
    optional: [
      "contents",
      "headings",
      "subtitle",
      "name",
      "included_segments",
      "excluded_segments",
      "include_aliases",
      "include_subscription_ids",
      "filters",
      "template_id",
      "send_after",
      "url",
      "web_url",
      "app_url",
      "data",
      "custom_data",
      "content_available",
    ],
    additionalProperties: true,
  },
);

const createPushNotificationOutputSchema = s.object(
  "The create push notification response returned by OneSignal.",
  {
    id: nonEmptyString("The created OneSignal message identifier."),
    external_id: s.anyOf("The upstream external id when OneSignal returns it.", [
      nonEmptyString("The upstream external id."),
      nullSchema,
    ]),
    errors: s.anyOf("OneSignal validation errors returned for the create request.", [
      s.unknown("The upstream errors payload."),
      nullSchema,
    ]),
    warnings: s.anyOf("OneSignal warnings returned for the create request.", [
      s.unknown("The upstream warnings payload."),
      nullSchema,
    ]),
  },
  {
    optional: ["external_id", "errors", "warnings"],
    additionalProperties: true,
  },
);

const listMessagesInputSchema = s.object(
  "Input parameters for listing messages from the connected OneSignal app.",
  {
    limit: s.integer("Maximum number of messages to return.", { minimum: 1, maximum: 50 }),
    offset: s.nonNegativeInteger("Pagination offset for the message list."),
    kind: templateKindSchema,
    template_id: templateIdSchema,
    time_offset: nonEmptyString("The sequential time_offset token returned by OneSignal."),
  },
  {
    optional: ["limit", "offset", "kind", "template_id", "time_offset"],
  },
);

const timeOffsetOutputSchema = s.anyOf("The sequential time_offset token returned by OneSignal.", [
  s.integer("A numeric OneSignal time_offset token."),
  nonEmptyString("A string OneSignal time_offset token."),
  nullSchema,
]);

const listMessagesOutputSchema = s.object(
  "The paginated message list returned by OneSignal.",
  {
    total_count: s.integer("Total number of messages matching the request."),
    offset: s.nonNegativeInteger("The offset echoed by OneSignal."),
    limit: s.integer("The limit echoed by OneSignal.", { minimum: 1, maximum: 50 }),
    time_offset: timeOffsetOutputSchema,
    next_time_offset: timeOffsetOutputSchema,
    notifications: s.array("Messages returned by OneSignal.", commonMessageSchema),
  },
  {
    optional: ["time_offset", "next_time_offset"],
    additionalProperties: true,
  },
);

export const onesignalRestApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_push_notification",
    description: "Create a push notification for the connected OneSignal app using one official targeting method.",
    inputSchema: createPushNotificationInputSchema,
    outputSchema: createPushNotificationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List messages from the connected OneSignal app.",
    inputSchema: listMessagesInputSchema,
    outputSchema: listMessagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Retrieve one OneSignal message by id from the connected app.",
    inputSchema: s.requiredObject("Input parameters for retrieving one OneSignal message.", {
      message_id: messageIdSchema,
    }),
    outputSchema: commonMessageSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_message",
    description: "Cancel one scheduled OneSignal message by id.",
    inputSchema: s.requiredObject("Input parameters for canceling one OneSignal message.", {
      message_id: messageIdSchema,
    }),
    outputSchema: s.object(
      "The cancel message response returned by OneSignal.",
      {
        success: s.boolean("Whether OneSignal accepted the cancellation request."),
      },
      {
        additionalProperties: true,
      },
    ),
  }),
];
