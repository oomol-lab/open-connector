import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sms_alert";

const emptyInputSchema = s.object({}, { description: "This action does not require any input." });
const nonEmptyString = (description: string) => s.nonEmptyString(description);
const positiveInteger = (description: string) => s.positiveInteger(description);

const routeBalanceSchema = s.object(
  {
    route: s.string("The SMS Alert route identifier."),
    displayName: s.string("The display name for this route in SMS Alert."),
    credits: s.integer("The remaining credits for this route."),
  },
  { required: ["route", "displayName", "credits"], description: "One SMS Alert balance route entry." },
);

const senderIdSchema = s.object(
  {
    sender: s.string("The sender ID value."),
    approved: s.boolean("Whether SMS Alert marks the sender as approved."),
    open: s.boolean("Whether the sender is currently open for use."),
    createdAt: s.string("The sender creation timestamp returned by SMS Alert."),
  },
  { required: ["sender", "approved", "open", "createdAt"], description: "One sender ID entry returned by SMS Alert." },
);

const templateSchema = s.object(
  {
    id: s.string("The template identifier."),
    title: s.string("The template title."),
    template: s.string("The SMS template body."),
    createdAt: s.string("The template creation timestamp returned by SMS Alert."),
  },
  { required: ["id", "title", "template", "createdAt"], description: "One template entry returned by SMS Alert." },
);

const deliverySchema = s.object(
  {
    mobileNumber: s.string("The destination mobile number."),
    messageId: s.string("The provider message identifier."),
    status: s.string("The provider delivery status string."),
  },
  { required: ["mobileNumber", "messageId", "status"], description: "One SMS Alert batch delivery entry." },
);

const batchOperationOutputSchema = s.actionOutput(
  {
    message: s.string("The provider message returned by SMS Alert."),
    batchId: s.string("The batch identifier returned by SMS Alert."),
    deliveries: s.array("The batch delivery records returned by SMS Alert.", deliverySchema),
  },
  "The normalized SMS Alert batch operation response.",
);

export const smsAlertActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credit_balance",
    description: "Get the remaining SMS Alert credits grouped by delivery route.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        summary: s.string("The raw balance summary string returned by SMS Alert."),
        routes: s.array("The route-level balances available on the account.", routeBalanceSchema),
      },
      "The SMS Alert credit balance response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_sender_ids",
    description: "List the sender IDs available in the SMS Alert account.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        senders: s.array("The sender IDs currently available for the account.", senderIdSchema),
      },
      "The SMS Alert sender list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List SMS templates from the SMS Alert account with optional pagination.",
    inputSchema: s.object(
      {
        order: s.stringEnum("The sort order for template listing.", ["asc", "desc"]),
        page: positiveInteger("The 1-based page number to request from SMS Alert."),
        limit: positiveInteger("The page size to request from SMS Alert."),
      },
      { optional: ["order", "page", "limit"], description: "The input payload for listing SMS Alert templates." },
    ),
    outputSchema: s.actionOutput(
      {
        templates: s.array("The SMS templates currently available for the account.", templateSchema),
      },
      "The SMS Alert template list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "send_sms",
    description: "Send a direct SMS message through SMS Alert.",
    inputSchema: s.actionInput(
      {
        senderId: nonEmptyString("The sender ID assigned to your SMS Alert account."),
        mobileNumbers: nonEmptyString(
          "One or more destination numbers, separated by commas when sending to multiple recipients.",
        ),
        message: nonEmptyString("The SMS body to send."),
      },
      ["senderId", "mobileNumbers", "message"],
      "The input payload for sending a direct SMS through SMS Alert.",
    ),
    outputSchema: batchOperationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "generate_otp",
    description: "Generate and send an OTP message through SMS Alert.",
    inputSchema: s.actionInput(
      {
        senderId: nonEmptyString("The sender ID used for the OTP message."),
        mobileNumber: nonEmptyString("The destination mobile number for the OTP."),
        template: s.string({
          minLength: 1,
          pattern: "\\\\[otp(?:\\\\]|[ \\\\t\\\\n][^\\\\[]*\\\\])",
          description:
            'The OTP template text, which must include the "[otp]" placeholder and may include optional length/retry/validity attributes.',
        }),
      },
      ["senderId", "mobileNumber", "template"],
      "The input payload for generating an OTP through SMS Alert.",
    ),
    outputSchema: batchOperationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "validate_otp",
    description: "Validate an OTP code previously generated through SMS Alert.",
    inputSchema: s.actionInput(
      {
        mobileNumber: nonEmptyString("The destination mobile number used during OTP generation."),
        code: nonEmptyString("The OTP code entered by the user."),
      },
      ["mobileNumber", "code"],
      "The input payload for validating an OTP through SMS Alert.",
    ),
    outputSchema: s.actionOutput(
      {
        matched: s.boolean("Whether SMS Alert reported that the OTP matched."),
        message: s.string("The provider validation message returned by SMS Alert."),
      },
      "The normalized SMS Alert OTP validation response.",
    ),
  }),
];
