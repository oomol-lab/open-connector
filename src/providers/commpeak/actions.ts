import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "commpeak";

const pageSchema = s.positiveInteger("The 1-based page number to request.");
const itemsPerPageSchema = s.positiveInteger("The number of items to request per page.");
const streamIdSchema = s.positiveInteger("The numeric TextPeak stream ID.");
const dateSchema = s.date("A date filter in YYYY-MM-DD format.");
const looseRawSchema = s.looseObject("The raw object returned by CommPeak.");

const streamTagSchema = s.requiredObject("A tag attached to a TextPeak stream.", {
  id: s.nullable(s.integer("The tag identifier.")),
  value: s.nullable(s.string("The tag value.")),
});

const streamSchema = s.requiredObject("A normalized TextPeak stream.", {
  id: s.nullable(s.integer("The stream identifier.")),
  streamUid: s.nullable(s.string("The opaque stream UID.")),
  name: s.nullable(s.string("The stream name.")),
  description: s.nullable(s.string("The stream description.")),
  type: s.nullable(s.string("The stream type returned by TextPeak.")),
  callerId: s.nullable(s.string("The caller ID for voice streams when returned.")),
  ipAcl: s.nullable(s.string("The stream IP allow-list when returned.")),
  state: s.nullable(s.string("The stream state returned by TextPeak.")),
  streamTags: s.array("The tags returned with the stream.", streamTagSchema),
  raw: looseRawSchema,
});

const senderSchema = s.requiredObject("A normalized TextPeak sender identity.", {
  id: s.nullable(s.integer("The sender identifier.")),
  name: s.nullable(s.string("The sender display name.")),
  value: s.nullable(s.string("The sender ID or phone number used on outbound messages.")),
  dailyLimit: s.nullable(s.integer("The maximum messages this sender may send per day.")),
  stream: s.nullable(s.string("The stream IRI this sender belongs to when returned.")),
  senderType: s.nullable(s.string("The sender type returned by TextPeak.")),
  status: s.nullable(s.string("The sender approval status returned by TextPeak.")),
  raw: looseRawSchema,
});

const domainSchema = s.requiredObject("A normalized TextPeak domain.", {
  id: s.nullable(s.integer("The domain identifier.")),
  name: s.nullable(s.string("The domain name.")),
  ip: s.nullable(s.string("The IP address the domain should point to when returned.")),
  status: s.nullable(s.string("The domain configuration status returned by TextPeak.")),
  raw: looseRawSchema,
});

const messageContentSchema = s.requiredObject("The message content returned by TextPeak.", {
  type: s.nullable(s.string("The content type returned by TextPeak.")),
  text: s.nullable(s.string("The message body returned by TextPeak.")),
});

const outgoingMessageSchema = s.requiredObject("A normalized outgoing TextPeak message.", {
  type: s.nullable(s.string("The message direction returned by TextPeak.")),
  messageUuid: s.nullable(s.string("The message UUID.")),
  externalKey: s.nullable(s.string("The vendor or external reference.")),
  sentAt: s.nullable(s.string("The UTC time when the message was sent.")),
  deliveredAt: s.nullable(s.string("The UTC time when delivery was confirmed.")),
  status: s.nullable(s.string("The delivery status returned by TextPeak.")),
  sourceNumber: s.nullable(s.string("The sender number or ID.")),
  sourceName: s.nullable(s.string("The sender display name.")),
  destinationNumber: s.nullable(s.string("The recipient phone number.")),
  countryCode: s.nullable(s.string("The recipient country dialing code.")),
  countryIso: s.nullable(s.string("The recipient ISO 3166 alpha-2 country code.")),
  countryName: s.nullable(s.string("The recipient country name.")),
  cost: s.nullable(s.number("The message cost returned by TextPeak.")),
  channel: s.nullable(s.string("The delivery channel returned by TextPeak.")),
  content: s.nullable(messageContentSchema),
  conversationUuid: s.nullable(s.string("The conversation UUID.")),
  streamId: s.nullable(s.string("The stream identifier returned by TextPeak.")),
  campaignId: s.nullable(s.string("The campaign identifier when returned.")),
  raw: looseRawSchema,
});

const incomingMessageSchema = s.requiredObject("A normalized incoming TextPeak message.", {
  messageUuid: s.nullable(s.string("The message UUID.")),
  receivedAt: s.nullable(s.string("The UTC time when the message was received.")),
  sourceNumber: s.nullable(s.string("The sender phone number.")),
  destinationNumber: s.nullable(s.string("The recipient number or sender ID.")),
  contactName: s.nullable(s.string("The resolved contact name when returned.")),
  countryCode: s.nullable(s.string("The sender country dialing code.")),
  countryIso: s.nullable(s.string("The sender ISO 3166 alpha-2 country code.")),
  countryName: s.nullable(s.string("The sender country name.")),
  text: s.nullable(s.string("The incoming message text.")),
  length: s.nullable(s.integer("The incoming message body length.")),
  conversationUuid: s.nullable(s.string("The conversation UUID.")),
  streamId: s.nullable(s.string("The stream identifier returned by TextPeak.")),
  raw: looseRawSchema,
});

const messagePageSchema = s.requiredObject("A normalized paginated TextPeak response.", {
  totalItems: s.nullable(s.integer("The total number of matching records when returned.")),
  raw: looseRawSchema,
});

const outboundSmsMessageInputSchema = s.object(
  "One SMS message to send through TextPeak.",
  {
    internalId: s.nonEmptyString("Your unique identifier for the message, echoed in responses and delivery webhooks."),
    sender: s.nonEmptyString(
      "The per-message sender ID or phone number. Required when no top-level sender is provided.",
    ),
    recipientPhone: s.nonEmptyString("The recipient phone number in international digits-only format."),
    messageContent: s.nonEmptyString("The SMS message body."),
  },
  { optional: ["internalId", "sender"] },
);

const smsSendMessageResultSchema = s.requiredObject("One TextPeak SMS send result.", {
  internalId: s.nullable(s.string("The internal ID supplied in the request.")),
  messageUuid: s.nullable(s.string("The platform-assigned message UUID.")),
  conversationUuid: s.nullable(s.string("The conversation UUID.")),
  error: s.nullable(s.string("The per-message error code when the message failed.")),
  details: s.nullable(s.string("The per-message failure detail when returned.")),
  raw: looseRawSchema,
});

const listInputSchema = s.object(
  "Pagination input for listing TextPeak resources.",
  {
    page: pageSchema,
    itemsPerPage: itemsPerPageSchema,
  },
  { optional: ["page", "itemsPerPage"] },
);

const listStreamsAction = defineProviderAction(service, {
  name: "list_streams",
  operationType: "read",
  description: "List TextPeak streams in the CommPeak account.",
  inputSchema: listInputSchema,
  outputSchema: s.requiredObject("The TextPeak streams returned by CommPeak.", {
    streams: s.array("The streams returned by CommPeak.", streamSchema),
  }),
});

const getStreamAction = defineProviderAction(service, {
  name: "get_stream",
  operationType: "read",
  description: "Retrieve one TextPeak stream by ID.",
  inputSchema: s.requiredObject("Input for retrieving one TextPeak stream.", {
    streamId: streamIdSchema,
  }),
  outputSchema: s.requiredObject("The TextPeak stream returned by CommPeak.", {
    stream: streamSchema,
  }),
});

const getStreamTokenAction = defineProviderAction(service, {
  name: "get_stream_token",
  operationType: "read",
  description: "Retrieve the stream token used to call TextPeak messaging endpoints.",
  inputSchema: s.requiredObject("Input for retrieving one TextPeak stream token.", {
    streamId: streamIdSchema,
  }),
  outputSchema: s.requiredObject("The TextPeak stream token returned by CommPeak.", {
    token: s.string("The stream token sent as the raw Authorization header value."),
  }),
});

const listSendersAction = defineProviderAction(service, {
  name: "list_senders",
  operationType: "read",
  description: "List TextPeak sender identities in the CommPeak account.",
  inputSchema: listInputSchema,
  outputSchema: s.requiredObject("The TextPeak sender identities returned by CommPeak.", {
    senders: s.array("The sender identities returned by CommPeak.", senderSchema),
  }),
});

const listDomainsAction = defineProviderAction(service, {
  name: "list_domains",
  operationType: "read",
  description: "List TextPeak domains in the CommPeak account.",
  inputSchema: listInputSchema,
  outputSchema: s.requiredObject("The TextPeak domains returned by CommPeak.", {
    domains: s.array("The domains returned by CommPeak.", domainSchema),
  }),
});

const listMessagesAction = defineProviderAction(service, {
  name: "list_messages",
  operationType: "read",
  description: "List outgoing TextPeak messages with optional filters.",
  inputSchema: s.object(
    "Input filters for listing outgoing TextPeak messages.",
    {
      type: s.nonEmptyString("The message direction to return, such as outgoing."),
      status: s.nonEmptyString("The delivery status filter."),
      streamId: streamIdSchema,
      phone: s.nonEmptyString("The recipient phone number filter."),
      startDate: dateSchema,
      endDate: dateSchema,
      page: pageSchema,
      itemsPerPage: itemsPerPageSchema,
    },
    {
      optional: ["type", "status", "streamId", "phone", "startDate", "endDate", "page", "itemsPerPage"],
    },
  ),
  outputSchema: s.requiredObject("The outgoing TextPeak messages returned by CommPeak.", {
    items: s.array("The outgoing messages returned by CommPeak.", outgoingMessageSchema),
    page: messagePageSchema,
  }),
});

const listIncomingMessagesAction = defineProviderAction(service, {
  name: "list_incoming_messages",
  operationType: "read",
  description: "List incoming TextPeak messages with optional filters.",
  inputSchema: s.object(
    "Input filters for listing incoming TextPeak messages.",
    {
      streamId: streamIdSchema,
      sender: s.nonEmptyString("The sender phone number filter."),
      destination: s.nonEmptyString("The destination number or sender ID filter."),
      startDate: dateSchema,
      endDate: dateSchema,
      page: pageSchema,
      itemsPerPage: itemsPerPageSchema,
    },
    {
      optional: ["streamId", "sender", "destination", "startDate", "endDate", "page", "itemsPerPage"],
    },
  ),
  outputSchema: s.requiredObject("The incoming TextPeak messages returned by CommPeak.", {
    items: s.array("The incoming messages returned by CommPeak.", incomingMessageSchema),
    page: messagePageSchema,
  }),
});

const sendSmsAction = defineProviderAction(service, {
  name: "send_sms",
  operationType: "write",
  description:
    "Send one or more SMS messages through a TextPeak stream, fetching the stream token with the API key before sending.",
  inputSchema: s.object(
    "Input for sending one or more SMS messages through TextPeak.",
    {
      streamId: streamIdSchema,
      sender: s.nonEmptyString(
        "The top-level sender applied to every message. Omit it when each message has its own sender.",
      ),
      messages: s.array(
        "The SMS messages to send. TextPeak supports up to 250 per request.",
        outboundSmsMessageInputSchema,
        {
          minItems: 1,
          maxItems: 250,
        },
      ),
    },
    { optional: ["sender"] },
  ),
  outputSchema: s.requiredObject("The SMS send acceptance response returned by TextPeak.", {
    status: s.boolean("Whether TextPeak accepted the batch for delivery."),
    taskId: s.nullable(s.string("The accepted batch task ID.")),
    messages: s.array("The per-message acceptance results returned by TextPeak.", smsSendMessageResultSchema),
    raw: looseRawSchema,
  }),
});

export const commpeakActions: ActionDefinition[] = [
  listStreamsAction,
  getStreamAction,
  getStreamTokenAction,
  listSendersAction,
  listDomainsAction,
  listMessagesAction,
  listIncomingMessagesAction,
  sendSmsAction,
];
