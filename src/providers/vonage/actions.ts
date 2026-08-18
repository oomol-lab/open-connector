import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const smsMessageSchema = s.object("One normalized Vonage SMS submission result.", {
  to: s.string("The destination number in E.164 format."),
  messageId: s.string("The Vonage message identifier."),
  status: s.string("The Vonage SMS status code."),
  remainingBalance: s.nullable(s.string("The estimated remaining account balance.")),
  messagePrice: s.nullable(s.string("The estimated price of the message.")),
  network: s.nullable(s.string("The destination network identifier.")),
  clientRef: s.nullable(s.string("The caller-supplied client reference.")),
});

const smsRecordSchema = s.object("One normalized Vonage SMS report record.", {
  recordId: s.nullableString("The Vonage report record identifier."),
  messageId: s.nullableString("The Vonage message identifier."),
  accountId: s.nullableString("The Vonage account identifier."),
  direction: s.nullableString("The communication direction."),
  from: s.nullableString("The sender number or sender ID."),
  to: s.nullableString("The destination phone number."),
  status: s.nullableString("The final delivery status."),
  dateReceived: s.nullableString("When Vonage received the SMS request."),
  dateFinalized: s.nullableString("When the SMS reached its final state."),
  totalPrice: s.nullableString("The total price charged for the SMS request."),
  currency: s.nullableString("The currency for the SMS price."),
  clientRef: s.nullableString("The caller-supplied client reference."),
  network: s.nullableString("The destination mobile network code."),
  networkName: s.nullableString("The destination mobile network name."),
  country: s.nullableString("The destination country code."),
  countryName: s.nullableString("The destination country name."),
  messageBody: s.nullableString("The message body when requested with includeMessage."),
  errorCode: s.nullableString("The Vonage delivery or handoff error code."),
  errorCodeDescription: s.nullableString("The description of the delivery or handoff error."),
});

const reportOutputSchema = s.actionOutput(
  {
    records: s.array("The normalized SMS report records.", smsRecordSchema),
    requestId: s.nullableString("The synchronous Reports API request identifier."),
    requestStatus: s.nullableString("The synchronous Reports API request status."),
    itemsCount: s.nullableInteger("The number of records returned in this response."),
    idsNotFound: s.nullableString("Comma-separated message IDs that were not found, if any."),
    nextCursor: s.nullableString("The cursor for the next date-based result page, if any."),
    iv: s.nullableString("The initialization vector required with the next cursor, if any."),
  },
  "The normalized Vonage SMS report response.",
);

const reportDirectionSchema = s.stringEnum("The communication direction.", ["inbound", "outbound"]);
const reportDateSchema = s.nonEmptyString(
  "An ISO-8601 timestamp used as an inclusive start or exclusive end boundary.",
);

export const vonageActions: ActionDefinition[] = [
  defineProviderAction("vonage", {
    name: "get_balance",
    description: "Retrieve the current balance of the connected Vonage API account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for this action.", {}),
    outputSchema: s.object("The current Vonage account balance.", {
      value: s.number("The account balance in euros."),
      autoReload: s.boolean("Whether automatic balance reload is enabled."),
    }),
  }),
  defineProviderAction("vonage", {
    name: "send_sms",
    description: "Send a text or Unicode SMS through the Vonage SMS API.",
    requiredScopes: [],
    inputSchema: s.object(
      "The outbound Vonage SMS payload.",
      {
        from: s.nonEmptyString(
          "The sender name or number. Number senders use E.164 format; sender ID rules vary by country.",
        ),
        to: s.string("The destination number in E.164 format without a leading plus sign.", {
          minLength: 7,
          maxLength: 15,
          pattern: "^[0-9]{7,15}$",
        }),
        text: s.nonEmptyString("The text body of the outbound SMS."),
        type: s.stringEnum("The SMS text encoding.", ["text", "unicode"]),
        ttl: s.integer("How long Vonage should attempt delivery, in milliseconds.", {
          minimum: 20_000,
          maximum: 604_800_000,
        }),
        statusReportRequired: s.boolean("Whether Vonage should request a delivery receipt."),
        callback: s.string("The delivery receipt callback URL for this message.", {
          maxLength: 100,
          format: "uri",
        }),
        clientRef: s.string("A caller-defined reference included in the submission result.", {
          maxLength: 100,
        }),
      },
      { optional: ["type", "ttl", "statusReportRequired", "callback", "clientRef"] },
    ),
    outputSchema: s.object("The normalized Vonage SMS submission response.", {
      messageCount: s.integer("The number of SMS submission results returned by Vonage."),
      messages: s.array("The submitted SMS results.", smsMessageSchema),
    }),
  }),
  defineProviderAction("vonage", {
    name: "list_sms_records",
    description: "List Vonage SMS delivery records for a date range and optional delivery filters.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        direction: reportDirectionSchema,
        dateStart: reportDateSchema,
        dateEnd: reportDateSchema,
        cursor: s.nonEmptyString("The cursor returned by a previous date-based report response."),
        iv: s.nonEmptyString("The initialization vector returned with a previous report cursor."),
        status: s.nonEmptyString("Filter records by final delivery status."),
        from: s.nonEmptyString("Filter records by sender number or sender ID."),
        to: s.nonEmptyString("Filter records by destination phone number."),
        country: s.nonEmptyString("Filter records by destination country code."),
        network: s.nonEmptyString("Filter records by destination mobile network code."),
        accountRef: s.nonEmptyString("Filter records by the caller-supplied account reference."),
        includeMessage: s.boolean("Include the SMS body in each returned record."),
        showConcatenated: s.boolean("Include whether an outbound SMS was split into multiple parts."),
      },
      ["direction"],
      "The input payload for listing Vonage SMS records.",
    ),
    outputSchema: reportOutputSchema,
  }),
  defineProviderAction("vonage", {
    name: "get_sms_record",
    description: "Retrieve a Vonage SMS delivery record by message ID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        messageId: s.nonEmptyString("The Vonage message ID to retrieve."),
        direction: reportDirectionSchema,
        includeMessage: s.boolean("Include the SMS body in the returned record."),
        showConcatenated: s.boolean("Include whether the outbound SMS was split into multiple parts."),
      },
      ["messageId", "direction"],
      "The input payload for retrieving one Vonage SMS record.",
    ),
    outputSchema: reportOutputSchema,
  }),
];
