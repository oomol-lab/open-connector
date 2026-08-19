import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ably";

const channelIdField = s.string({
  description: "The Ably channel ID or channel name.",
  minLength: 1,
});
const channelArrayField = s.array(channelIdField, {
  description: "The Ably channel names to query.",
  minItems: 1,
  maxItems: 100,
});

const channelListField = s.anyOf(
  [
    channelArrayField,
    s.string({
      description: "A separator-delimited list of Ably channel names.",
      minLength: 1,
    }),
  ],
  { description: "One or more Ably channel names." },
);
const separatorField = s.string({
  description: "The separator used when channels is provided as a string.",
  minLength: 1,
});
const timestampField = s.integer({
  description: "A timestamp in milliseconds since the Unix epoch.",
});
const limitField = s.integer({
  description: "The maximum number of records to return.",
  minimum: 1,
  maximum: 1000,
});
const directionField = s.stringEnum(["backwards", "forwards"], {
  description: "The Ably pagination direction.",
});
const messageDataField = s.unknown("The JSON-encodable Ably message payload.");

const paginationLinksSchema = s.looseObject(
  {
    first: s.string({ description: "The URL for the first result page." }),
    current: s.string({ description: "The URL for the current result page." }),
    next: s.string({ description: "The URL for the next result page." }),
  },
  { description: "Pagination links returned by Ably." },
);

const messageSchema = s.looseObject(
  {
    id: s.string({ description: "The unique Ably message ID." }),
    name: s.string({ description: "The Ably event name." }),
    data: messageDataField,
    encoding: s.string({ description: "The Ably message encoding." }),
    clientId: s.string({ description: "The Ably client ID associated with the message." }),
    connectionId: s.string({
      description: "The Ably connection ID associated with the message.",
    }),
    timestamp: timestampField,
  },
  { description: "An Ably message." },
);

const presenceMessageSchema = s.looseObject(
  {
    id: s.string({ description: "The unique Ably presence member ID." }),
    clientId: s.string({
      description: "The Ably client ID associated with the presence member.",
    }),
    connectionId: s.string({
      description: "The Ably connection ID associated with the presence member.",
    }),
    timestamp: timestampField,
    action: s.integer({ description: "The Ably presence action enum value." }),
    data: messageDataField,
  },
  { description: "An Ably presence message." },
);

const batchPresenceResultSchema = s.looseObject(
  {
    channel: s.string({ description: "The Ably channel name." }),
    presence: s.array(presenceMessageSchema, {
      description: "The presence members returned for the channel.",
    }),
  },
  { description: "Presence data for one Ably channel." },
);

const batchPresenceHistoryResultSchema = s.looseObject(
  {
    channel: s.string({ description: "The Ably channel name." }),
    presence: s.array(presenceMessageSchema, {
      description: "The presence history records returned for the channel.",
    }),
    links: paginationLinksSchema,
  },
  { description: "Presence history data for one Ably channel." },
);

const channelDetailsSchema = s.looseObject(
  {
    channelId: s.string({ description: "The Ably channel ID." }),
    status: s.object(
      {
        isActive: s.boolean({ description: "Whether the channel is currently active." }),
        occupancy: s.looseObject({}, { description: "The Ably channel occupancy metrics." }),
      },
      {
        description: "The Ably channel lifecycle status.",
      },
    ),
  },
  { description: "Ably channel details." },
);

const statsSchema = s.looseObject(
  {
    intervalId: s.string({ description: "The Ably statistics interval identifier." }),
    unit: s.string({ description: "The interval unit used for the statistics record." }),
  },
  { description: "An Ably application statistics record." },
);

const pushSubscriptionSchema = s.looseObject(
  {
    channel: s.string({ description: "The Ably channel name for the subscription." }),
    clientId: s.string({ description: "The client ID associated with the subscription." }),
    deviceId: s.string({ description: "The device ID associated with the subscription." }),
  },
  { description: "An Ably push channel subscription." },
);

const publishResultSchema = s.looseObject(
  {
    channel: s.string({ description: "The Ably channel that received the message." }),
    messageId: s.string({ description: "The Ably message ID assigned to the published message." }),
  },
  { description: "The Ably publish response." },
);

const historyQueryFields = {
  start: timestampField,
  end: timestampField,
  limit: limitField,
  direction: directionField,
};

const batchPresenceInputSchema = s.object(
  {
    channels: channelListField,
    separator: separatorField,
  },
  {
    required: ["channels"],
    description: "Input for querying Ably presence across multiple channels.",
  },
);

const batchPresenceHistoryInputSchema = s.object(
  {
    channels: channelListField,
    separator: separatorField,
    ...historyQueryFields,
  },
  {
    required: ["channels"],
    description: "Input for querying Ably presence history across multiple channels.",
  },
);

const channelOnlyInputSchema = s.object(
  {
    channel_id: channelIdField,
  },
  {
    required: ["channel_id"],
    description: "Input containing one Ably channel ID.",
  },
);

const channelHistoryInputSchema = s.object(
  {
    channel_id: channelIdField,
    ...historyQueryFields,
  },
  {
    required: ["channel_id"],
    description: "Input for retrieving Ably channel message or presence history.",
  },
);

const getStatsInputSchema = s.object(
  {
    ...historyQueryFields,
    unit: s.stringEnum(["minute", "hour", "day", "month"], {
      description: "The Ably statistics aggregation unit.",
    }),
  },
  { description: "Input for retrieving Ably application statistics." },
);

const deleteChannelSubscriptionInputSchema = s.object(
  {
    channel: channelIdField,
    client_id: s.string({
      description: "The Ably client ID to unsubscribe.",
      minLength: 1,
    }),
    device_id: s.string({
      description: "The Ably device ID to unsubscribe.",
      minLength: 1,
    }),
  },
  { description: "Input for deleting an Ably push channel subscription." },
);

const listPushChannelSubscriptionsInputSchema = s.object(
  {
    channel: channelIdField,
    client_id: s.string({
      description: "Filter subscriptions by Ably client ID.",
      minLength: 1,
    }),
    device_id: s.string({
      description: "Filter subscriptions by Ably device ID.",
      minLength: 1,
    }),
    concat_filters: s.boolean({
      description: "Whether to match either client_id or device_id when both are set.",
    }),
    limit: limitField,
  },
  { description: "Input for listing Ably push channel subscriptions." },
);

const publishMessageInputSchema = s.object(
  {
    channel_id: channelIdField,
    data: messageDataField,
    name: s.string({
      description: "The optional Ably event name for the message.",
      minLength: 1,
    }),
    id: s.string({
      description: "The optional Ably message ID used for idempotent publishing.",
      minLength: 1,
    }),
    encoding: s.string({
      description: "The optional Ably message encoding.",
      minLength: 1,
    }),
    client_id: s.string({
      description: "The optional Ably client ID for the message.",
      minLength: 1,
    }),
    connection_key: s.string({
      description: "The optional private Ably connection key.",
      minLength: 1,
    }),
    extras: s.looseObject({}, { description: "Optional Ably message extras, such as push notification payloads." }),
  },
  {
    required: ["channel_id", "data"],
    description: "Input for publishing one message to an Ably channel.",
  },
);

const batchPresenceOutputSchema = s.object(
  {
    results: s.array(batchPresenceResultSchema, {
      description: "Presence results returned by Ably.",
    }),
    links: paginationLinksSchema,
  },
  {
    required: ["results"],
    description: "The normalized Ably batch presence response.",
  },
);

const batchPresenceHistoryOutputSchema = s.object(
  {
    results: s.array(batchPresenceHistoryResultSchema, {
      description: "Presence history results returned for each requested channel.",
    }),
  },
  {
    required: ["results"],
    description: "The normalized Ably batch presence history response.",
  },
);

const createChannelOutputSchema = s.object(
  {
    channel_id: channelIdField,
    channel: channelDetailsSchema,
  },
  {
    required: ["channel_id", "channel"],
    description: "The normalized Ably channel activation response.",
  },
);

const deleteChannelSubscriptionOutputSchema = s.object(
  {
    success: s.boolean({ description: "Whether Ably accepted the delete request." }),
  },
  {
    required: ["success"],
    description: "The normalized Ably channel subscription delete response.",
  },
);

const channelDetailsOutputSchema = s.object(
  {
    channel: channelDetailsSchema,
  },
  {
    required: ["channel"],
    description: "The normalized Ably channel details response.",
  },
);

const channelHistoryOutputSchema = s.object(
  {
    messages: s.array(messageSchema, {
      description: "Ably messages returned by the history request.",
    }),
    links: paginationLinksSchema,
  },
  {
    required: ["messages"],
    description: "The normalized Ably channel history response.",
  },
);

const presenceHistoryOutputSchema = s.object(
  {
    presence: s.array(presenceMessageSchema, {
      description: "Ably presence history records returned by the request.",
    }),
    links: paginationLinksSchema,
  },
  {
    required: ["presence"],
    description: "The normalized Ably presence history response.",
  },
);

const serviceTimeOutputSchema = s.object(
  {
    time: timestampField,
  },
  {
    required: ["time"],
    description: "The normalized Ably service time response.",
  },
);

const statsOutputSchema = s.object(
  {
    stats: s.array(statsSchema, {
      description: "Ably statistics records returned by the request.",
    }),
    links: paginationLinksSchema,
  },
  {
    required: ["stats"],
    description: "The normalized Ably application stats response.",
  },
);

const listPushChannelSubscriptionsOutputSchema = s.object(
  {
    subscriptions: s.array(pushSubscriptionSchema, {
      description: "Ably push channel subscriptions returned by the request.",
    }),
    links: paginationLinksSchema,
  },
  {
    required: ["subscriptions"],
    description: "The normalized Ably push channel subscriptions response.",
  },
);

const publishMessageOutputSchema = s.object(
  {
    result: publishResultSchema,
  },
  {
    required: ["result"],
    description: "The normalized Ably publish message response.",
  },
);

export const ablyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "batch_presence",
    description: "Query current presence for multiple Ably channels.",
    inputSchema: batchPresenceInputSchema,
    outputSchema: batchPresenceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_presence_history",
    description: "Query presence history for multiple Ably channels.",
    inputSchema: batchPresenceHistoryInputSchema,
    outputSchema: batchPresenceHistoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_channel",
    description: "Activate an Ably channel by retrieving its metadata.",
    inputSchema: channelOnlyInputSchema,
    outputSchema: createChannelOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_channel_subscription",
    description: "Delete an Ably push notification subscription for a channel, device, or client.",
    inputSchema: deleteChannelSubscriptionInputSchema,
    outputSchema: deleteChannelSubscriptionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_channel_details",
    description: "Retrieve Ably metadata and occupancy details for one channel.",
    inputSchema: channelOnlyInputSchema,
    outputSchema: channelDetailsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_channel_history",
    description: "Retrieve message history for one Ably channel.",
    inputSchema: channelHistoryInputSchema,
    outputSchema: channelHistoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_presence_history",
    description: "Retrieve presence history for one Ably channel.",
    inputSchema: channelHistoryInputSchema,
    outputSchema: presenceHistoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_service_time",
    description: "Retrieve Ably service time in milliseconds since the Unix epoch.",
    inputSchema: s.object({}, { description: "No input is required to retrieve Ably service time." }),
    outputSchema: serviceTimeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_stats",
    description: "Retrieve Ably application usage statistics.",
    inputSchema: getStatsInputSchema,
    outputSchema: statsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_push_channel_subscriptions",
    description: "List Ably push notification channel subscriptions.",
    inputSchema: listPushChannelSubscriptionsInputSchema,
    outputSchema: listPushChannelSubscriptionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "publish_message_to_channel",
    description: "Publish one message to an Ably channel.",
    inputSchema: publishMessageInputSchema,
    outputSchema: publishMessageOutputSchema,
  }),
];
