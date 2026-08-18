import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "twilio";

const accountSchema = s.actionOutput(
  {
    accountSid: s.string("The Twilio account SID."),
    friendlyName: s.nullableString("The friendly name of the Twilio account."),
    status: s.nullableString("The current status of the Twilio account."),
    type: s.nullableString("The Twilio account type."),
  },
  "The normalized Twilio account payload.",
);
const usageRecordSchema = s.object("One normalized Twilio usage record.", {
  accountSid: s.nullableString("The Twilio account SID that owns the usage."),
  category: s.nullableString("The Twilio usage category."),
  count: s.nullableString("The number of units consumed in the record."),
  countUnit: s.nullableString("The unit for the usage count."),
  usage: s.nullableString("The aggregated usage amount."),
  usageUnit: s.nullableString("The unit for the aggregated usage amount."),
  price: s.nullableString("The billed price for the usage record."),
  priceUnit: s.nullableString("The currency unit for the billed price."),
  startDate: s.nullableString("The inclusive start date of the usage record."),
  endDate: s.nullableString("The inclusive end date of the usage record."),
});
const messageSchema = s.object("The normalized Twilio message payload.", {
  messageSid: s.string("The Twilio message SID."),
  accountSid: s.nullableString("The Twilio account SID that owns the message."),
  status: s.nullableString("The delivery status of the message."),
  to: s.nullableString("The destination phone number."),
  from: s.nullableString("The sender phone number."),
  body: s.nullableString("The text body of the message."),
});
const callSchema = s.object("The normalized Twilio call payload.", {
  callSid: s.string("The Twilio call SID."),
  accountSid: s.nullableString("The Twilio account SID that owns the call."),
  status: s.nullableString("The current or final call status."),
  direction: s.nullableString("The direction of the call."),
  to: s.nullableString("The called phone number, SIP address, or client identifier."),
  from: s.nullableString("The caller phone number or client identifier."),
  duration: s.nullableString("The call duration in seconds."),
  price: s.nullableString("The price charged for the call."),
  priceUnit: s.nullableString("The currency used for the call price."),
  startTime: s.nullableString("The time when the call started."),
  endTime: s.nullableString("The time when the call ended."),
  dateCreated: s.nullableString("The time when the call resource was created."),
  dateUpdated: s.nullableString("The time when the call resource was last updated."),
  phoneNumberSid: s.nullableString("The SID of the Twilio phone number used for the call."),
  parentCallSid: s.nullableString("The parent call SID when this is a child call."),
  queueTime: s.nullableString("The estimated queue time in milliseconds."),
  uri: s.nullableString("The relative URI of the Twilio call resource."),
});
const pageSizeSchema = s.integer("The maximum number of records to return in one page.", { minimum: 1 });
const callStatusSchema = s.stringEnum("The Twilio call status to filter by.", [
  "queued",
  "ringing",
  "in-progress",
  "canceled",
  "completed",
  "busy",
  "no-answer",
  "failed",
]);
const httpMethodSchema = s.stringEnum("The HTTP method Twilio should use.", ["GET", "POST"]);
const callProgressEventSchema = s.stringEnum("One Twilio call progress event.", [
  "initiated",
  "ringing",
  "answered",
  "completed",
]);

const createCallInputSchema = s.actionInput(
  {
    to: s.nonEmptyString("The phone number, SIP address, or client identifier to call."),
    from: s.nonEmptyString("The Twilio phone number or client identifier to use as caller ID."),
    url: s.url("The absolute URL that returns TwiML instructions for the call."),
    twiml: s.nonWhitespaceString("Inline TwiML instructions for the call."),
    method: httpMethodSchema,
    fallbackUrl: s.url("The fallback URL to request when the primary TwiML URL fails."),
    fallbackMethod: httpMethodSchema,
    statusCallback: s.url("The URL that receives asynchronous call status callbacks."),
    statusCallbackEvent: s.array("Call progress events to send to the status callback.", callProgressEventSchema),
    statusCallbackMethod: httpMethodSchema,
  },
  ["to", "from"],
  "The input payload for creating a Twilio call.",
);
createCallInputSchema.oneOf = [{ required: ["url"] }, { required: ["twiml"] }];

export const twilioActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Fetch the current Twilio account profile for the connected credential.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "No input is required for this action."),
    outputSchema: accountSchema,
  }),
  defineProviderAction(service, {
    name: "list_usage_records",
    description: "List Twilio usage records for the connected account.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        category: s.string("The Twilio usage category to filter by."),
        startDate: s.date("The inclusive start date in YYYY-MM-DD format."),
        endDate: s.date("The inclusive end date in YYYY-MM-DD format."),
        pageSize: pageSizeSchema,
      },
      [],
      "The input payload for listing Twilio usage records.",
    ),
    outputSchema: s.actionOutput(
      {
        usageRecords: s.array("The normalized usage records returned by Twilio.", usageRecordSchema),
        page: s.nullableInteger("The current Twilio result page."),
        pageSize: s.nullableInteger("The Twilio page size for this result."),
        nextPageUri: s.nullableString("The next page URI returned by Twilio, if any."),
      },
      "The output payload for listing Twilio usage records.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List SMS or MMS messages for the connected Twilio account.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        to: s.string("Only include messages sent to this phone number."),
        from: s.string("Only include messages sent from this phone number."),
        pageSize: pageSizeSchema,
        pageToken: s.string("The Twilio page token used to continue a previous listing."),
      },
      [],
      "The input payload for listing Twilio messages.",
    ),
    outputSchema: s.actionOutput(
      {
        messages: s.array("The normalized Twilio messages.", messageSchema),
        nextPageUri: s.nullableString("The next page URI returned by Twilio, if any."),
      },
      "The output payload for listing Twilio messages.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Fetch one Twilio message by message SID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { messageSid: s.nonEmptyString("The Twilio message SID to fetch.") },
      ["messageSid"],
      "The input payload for fetching one Twilio message.",
    ),
    outputSchema: messageSchema,
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send an outbound SMS or MMS message with Twilio.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        to: s.nonEmptyString("The destination phone number in E.164 format."),
        from: s.nonEmptyString("The Twilio phone number sending the message."),
        body: s.nonEmptyString("The text body of the outbound message."),
      },
      ["to", "from", "body"],
      "The input payload for sending a Twilio message.",
    ),
    outputSchema: messageSchema,
  }),
  defineProviderAction(service, {
    name: "list_calls",
    description: "List Twilio voice calls with optional recipient, status, date, and pagination filters.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        to: s.string("Only include calls made to this phone number, SIP address, or client identifier."),
        from: s.string("Only include calls made from this phone number, SIP address, or client identifier."),
        status: callStatusSchema,
        startTime: s.date("Only include calls that started on or after this date."),
        endTime: s.date("Only include calls that started before this date."),
        parentCallSid: s.string("Only include child calls of this parent call SID."),
        pageSize: pageSizeSchema,
        pageToken: s.string("The Twilio page token used to continue a previous listing."),
      },
      [],
      "The input payload for listing Twilio calls.",
    ),
    outputSchema: s.actionOutput(
      {
        calls: s.array("The normalized Twilio calls.", callSchema),
        page: s.nullableInteger("The current Twilio result page."),
        pageSize: s.nullableInteger("The Twilio page size for this result."),
        nextPageUri: s.nullableString("The next page URI returned by Twilio, if any."),
        previousPageUri: s.nullableString("The previous page URI returned by Twilio, if any."),
      },
      "The output payload for listing Twilio calls.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_call",
    description: "Fetch one Twilio voice call by call SID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { callSid: s.nonEmptyString("The Twilio call SID to fetch.") },
      ["callSid"],
      "The input payload for fetching one Twilio call.",
    ),
    outputSchema: callSchema,
  }),
  defineProviderAction(service, {
    name: "create_call",
    description: "Create an outbound Twilio voice call using a TwiML URL or inline TwiML.",
    requiredScopes: [],
    inputSchema: createCallInputSchema,
    outputSchema: callSchema,
  }),
];

export type TwilioActionName =
  | "get_account"
  | "list_usage_records"
  | "list_messages"
  | "get_message"
  | "send_message"
  | "list_calls"
  | "get_call"
  | "create_call";
