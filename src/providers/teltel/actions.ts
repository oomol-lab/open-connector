import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "teltel";

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const callbackSchema = s.anyOf("Callback URL or boolean toggle for delivery notifications.", [
  s.url("Callback URL for delivery notifications."),
  s.boolean("Boolean toggle for delivery notifications."),
  { type: "null", description: "No callback value." },
]);

const smsReportSchema = s.actionOutput(
  {
    messageId: s.string("The TelTel message ID."),
    from: s.nullableString("The sender ID or DID used for the outbound SMS."),
    to: s.nullableString("The destination phone number in international format."),
    state: s.nullableString("The current delivery state reported by TelTel."),
    detailedState: s.nullableString("The more detailed delivery state returned by TelTel."),
    createdAt: s.nullableString("The timestamp when TelTel created the message."),
    deliveredAt: s.nullableString("The timestamp when the message was delivered, if available."),
    multipart: s.nullableBoolean("Whether TelTel split the message into multiple parts."),
    parts: s.nullableInteger("The number of SMS parts used for the message."),
    price: s.nullableNumber("The TelTel price per message part."),
    totalPrice: s.nullableNumber("The total TelTel price for the whole message."),
    message: s.nullableString("The outbound SMS message body."),
    campaignId: s.nullableInteger("The TelTel campaign ID when the SMS belongs to a campaign."),
    errorMessage: s.nullableString("The TelTel error description when delivery failed."),
  },
  "The normalized TelTel outbound SMS delivery report.",
);

export const teltelActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_balance",
    description: "Get the current TelTel account balance, credit, and credit limit.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      credit: s.number("The current credit value of the TelTel account."),
      creditLimit: s.number("The maximum credit limit configured for the TelTel account."),
      balance: s.number("The currently available TelTel balance."),
    }),
  }),
  defineProviderAction(service, {
    name: "send_sms",
    description: "Send a single outbound SMS message through the TelTel SMS outbox API.",
    inputSchema: s.actionInput(
      {
        from: nonEmptyString("Sender ID or DID number used for the outbound SMS message."),
        to: nonEmptyString("Destination phone number in international format."),
        message: nonEmptyString("Plain-text SMS body to send through TelTel."),
        callback: callbackSchema,
      },
      ["from", "to", "message"],
    ),
    outputSchema: s.actionOutput({
      messageId: s.string("The TelTel message ID created for the new outbound SMS."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_sms_reports",
    description: "List outbound TelTel SMS delivery reports with optional paging and filter parameters.",
    inputSchema: s.actionInput({
      limit: s.integer("Maximum number of reports to return, up to 5000.", { minimum: 1, maximum: 5000 }),
      offset: s.integer("Number of reports to skip before returning results.", { minimum: 0 }),
      fields: s.string("Comma-separated list of TelTel report fields to include in the response."),
      sort: s.string("Comma-separated TelTel sort expression, for example -created_at."),
      filter: s.string("Comma-separated TelTel filter expression, for example from=37126118199."),
    }),
    outputSchema: s.actionOutput({
      reports: s.array("The normalized TelTel outbound SMS reports.", smsReportSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sms_report",
    description: "Get the delivery report for one outbound TelTel SMS message.",
    inputSchema: s.actionInput(
      {
        messageId: nonEmptyString("The TelTel outbound SMS message ID."),
        fields: s.string("Comma-separated list of TelTel report fields to include in the response."),
      },
      ["messageId"],
    ),
    outputSchema: smsReportSchema,
  }),
];
