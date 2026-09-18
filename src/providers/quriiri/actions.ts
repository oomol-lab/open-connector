import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "quriiri";

const messageStatusSchema = s.looseObject("A Quriiri SMS status record.", {
  drid: s.nonEmptyString("The Quriiri delivery report ID."),
  bodyparts: s.nonNegativeInteger("The number of SMS body parts."),
  direction: s.stringEnum("The message direction.", ["MT", "MO"]),
  batchid: s.string("The optional batch ID."),
  billingref: s.string("The optional billing reference."),
  created: s.string("The message creation timestamp.", { format: "date-time" }),
  statustime: s.string("The status timestamp.", { format: "date-time" }),
  reason: s.string("The failure reason, if any."),
  status: s.string("The current message status."),
  countrycode: s.string("The destination country code."),
});

const errorSchema = s.looseObject("A Quriiri error or warning message.", {
  message: s.string("The error or warning message."),
});

const sendSmsInputSchema = s.object(
  "The input payload for sending a Quriiri SMS message.",
  {
    sender: s.nonEmptyString("The SMS sender ID or phone number."),
    destination: s.array(
      "The recipient phone numbers in international, national, or shortcode format.",
      s.nonEmptyString("A recipient phone number."),
      { minItems: 1 },
    ),
    text: s.nonEmptyString("The SMS message text."),
    senderType: s.stringEnum("The sender type. Quriiri can also infer this when omitted.", [
      "MSISDN",
      "NATIONAL",
      "ALNUM",
    ]),
    batchId: s.string("The optional batch ID used to group related messages.", {
      maxLength: 255,
    }),
    billingRef: s.string("The optional billing reference stored for reporting.", {
      maxLength: 255,
    }),
    deliveryReportUrl: s.string("The optional URL where Quriiri sends delivery reports.", {
      format: "uri",
    }),
    deliveryReportType: s.stringEnum("The delivery report format.", ["JSON", "POST", "GET"]),
    flash: s.boolean("Whether to send the message as a flash SMS."),
    validityMinutes: s.positiveInteger("The message validity period in minutes."),
    scheduleTime: s.string("The optional scheduled send time in ISO 8601 format.", {
      format: "date-time",
    }),
  },
  {
    optional: [
      "senderType",
      "batchId",
      "billingRef",
      "deliveryReportUrl",
      "deliveryReportType",
      "flash",
      "validityMinutes",
      "scheduleTime",
    ],
  },
);

const sendSmsOutputSchema = s.requiredObject("The response returned after Quriiri processes the SMS send request.", {
  messages: s.record(
    "The per-recipient send results keyed by recipient phone number.",
    s.looseObject("A per-recipient send result.", {
      converted: s.string("The normalized destination phone number."),
      status: s.string("The message creation status."),
      reason: s.string("The failure reason, if the recipient failed."),
      messageid: s.string("The Quriiri message ID."),
    }),
  ),
  warnings: s.array("The warnings returned by Quriiri.", errorSchema),
  errors: s.array("The errors returned by Quriiri.", errorSchema),
});

const getSmsStatusInputSchema = s.requiredObject("The input payload for getting one Quriiri SMS status.", {
  deliveryReportId: s.nonEmptyString("The Quriiri delivery report ID."),
});

const getSmsStatusOutputSchema = s.requiredObject("The Quriiri SMS status response.", {
  status: messageStatusSchema,
});

const listSmsStatusesInputSchema = s.object(
  "The input payload for listing Quriiri SMS statuses.",
  {
    start: s.string("The inclusive start timestamp for the status search.", {
      format: "date-time",
    }),
    end: s.string("The exclusive end timestamp for the status search.", { format: "date-time" }),
    status: s.stringEnum("The optional message status filter.", [
      "CREATED",
      "SENT",
      "ACKED",
      "FAILED",
      "DELIVERED",
      "READ",
      "UNKNOWN",
      "RETRY",
    ]),
  },
  { optional: ["start", "end", "status"] },
);

const listSmsStatusesOutputSchema = s.requiredObject("The Quriiri SMS status list response.", {
  count: s.nonNegativeInteger("The number of matching status records."),
  messages: s.array("The matching SMS status records.", messageStatusSchema),
  start: s.string("The response start timestamp.", { format: "date-time" }),
  end: s.string("The response end timestamp.", { format: "date-time" }),
});

const listSenderIdsOutputSchema = s.requiredObject("The authorized and registered Quriiri sender IDs.", {
  authorized_sender_ids: s.array(
    "The sender IDs authorized in the Quriiri service.",
    s.string("An authorized sender ID."),
  ),
  registered_sender_ids: s.array("The sender IDs registered with Traficom.", s.string("A registered sender ID.")),
});

interface QuriiriActionOptions {
  readonly name: string;
  readonly operationType: ActionDefinition["operationType"];
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
}

function defineQuriiriAction(options: QuriiriActionOptions): ActionDefinition {
  return defineProviderAction(service, {
    name: options.name,
    operationType: options.operationType,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
  });
}

export const quriiriActions: ActionDefinition[] = [
  defineQuriiriAction({
    name: "send_sms",
    operationType: "write",
    description: "Send an SMS message with Quriiri using the HTTP JSON API.",
    inputSchema: sendSmsInputSchema,
    outputSchema: sendSmsOutputSchema,
  }),
  defineQuriiriAction({
    name: "get_sms_status",
    operationType: "read",
    description: "Get one Quriiri SMS delivery status by delivery report ID.",
    inputSchema: getSmsStatusInputSchema,
    outputSchema: getSmsStatusOutputSchema,
  }),
  defineQuriiriAction({
    name: "list_sms_statuses",
    operationType: "read",
    description: "List Quriiri SMS delivery statuses within an optional time range.",
    inputSchema: listSmsStatusesInputSchema,
    outputSchema: listSmsStatusesOutputSchema,
  }),
  defineQuriiriAction({
    name: "list_sender_ids",
    operationType: "read",
    description: "List authorized and registered sender IDs for the Quriiri customer.",
    inputSchema: s.object("The input payload for listing Quriiri sender IDs.", {}),
    outputSchema: listSenderIdsOutputSchema,
  }),
];
