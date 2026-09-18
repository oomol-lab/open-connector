import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "myotp_app";

const statusMessageFields = {
  status: s.string("The status returned by MyOTP.App."),
  message: s.string("The human-readable message returned by MyOTP.App."),
};

const generateOtpOutputSchema = s.object(
  "The OTP generation result returned by MyOTP.App.",
  {
    message_id: s.string("The unique identifier of the sent OTP message."),
    ...statusMessageFields,
    date_sent: s.string("The UTC timestamp when the OTP was sent.", { format: "date-time" }),
    expires_at: s.string("The UTC timestamp when the OTP expires.", { format: "date-time" }),
    cost: s.number("The cost charged for delivering the OTP."),
    otp: s.string("The generated OTP when return_otp was requested and permitted."),
  },
  { optional: ["message_id", "status", "message", "date_sent", "expires_at", "cost", "otp"] },
);

const transactionSchema = s.object(
  "A transaction returned by the MyOTP.App report endpoint.",
  {
    message_id: s.string("The unique identifier of the OTP message."),
    phone_number: s.string("The destination phone number."),
    cost: s.number("The transaction cost."),
    timestamp: s.string("The transaction timestamp in UTC.", { format: "date-time" }),
    message_type: s.integer("The numeric transaction type assigned by MyOTP.App."),
    description: s.string("The transaction description."),
    force_send: s.boolean("Whether the OTP was sent while another OTP was still active."),
    client_ip: s.string("The client IP recorded by MyOTP.App."),
    application: s.string("The application assigned to the API key."),
    created_at: s.string("The transaction creation timestamp in UTC.", { format: "date-time" }),
  },
  {
    optional: [
      "message_id",
      "phone_number",
      "cost",
      "timestamp",
      "message_type",
      "description",
      "force_send",
      "client_ip",
      "application",
      "created_at",
    ],
  },
);

export const myOtpAppActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "generate_otp",
    operationType: "write",
    description: "Generate and deliver an OTP through MyOTP.App by SMS or WhatsApp.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for generating and delivering an OTP.",
      {
        phone_number: s.string("The E.164 phone number including country code without a prefix.", {
          pattern: "^[1-9][0-9]{6,14}$",
        }),
        otp_length: s.integer("The number of digits in the generated OTP.", {
          minimum: 4,
          maximum: 8,
        }),
        otp_validity: s.integer("The OTP validity period in seconds.", {
          minimum: 60,
          maximum: 86400,
        }),
        channel: s.stringEnum("The channel used to deliver the OTP.", ["sms", "whatsapp"]),
        template_order: s.integer("The configured message template order.", {
          minimum: 1,
          maximum: 5,
        }),
        force_send: s.boolean("Whether to send a new OTP while an unexpired OTP exists."),
        return_otp: s.boolean("Whether to include the generated OTP in the response when permitted."),
        brand: s.string("The alphanumeric brand name that overrides the account default.", {
          minLength: 3,
          maxLength: 16,
          pattern: "^[a-zA-Z0-9]+$",
        }),
      },
      {
        optional: ["otp_length", "otp_validity", "channel", "template_order", "force_send", "return_otp", "brand"],
      },
    ),
    outputSchema: generateOtpOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_otp",
    operationType: "read",
    description: "Verify an OTP using its message id or destination phone number.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for verifying a MyOTP.App OTP.",
      {
        otp: s.string("The numeric OTP to verify.", { pattern: "^[0-9]{3,8}$" }),
        message_id: s.nonWhitespaceString("The message identifier returned when the OTP was generated."),
        phone_number: s.string("The E.164 phone number used to generate the OTP.", {
          pattern: "^[1-9][0-9]{6,14}$",
        }),
      },
      { optional: ["message_id", "phone_number"] },
    ),
    outputSchema: s.object(
      "The OTP verification result returned by MyOTP.App.",
      {
        status: s.stringEnum("The OTP verification status.", ["success", "failed", "expired"]),
        message: s.string("The human-readable verification result."),
        reason: s.string("The reason the verification failed when supplied."),
      },
      { optional: ["status", "message", "reason"] },
    ),
  }),
  defineProviderAction(service, {
    name: "extend_otp",
    operationType: "write",
    description: "Extend the expiry time of an existing MyOTP.App OTP.",
    requiredScopes: [],
    inputSchema: s.object("The input for extending an OTP expiry time.", {
      message_id: s.string("The message identifier of the OTP to extend."),
      duration: s.integer("The number of seconds to add to the OTP expiry time.", {
        minimum: 60,
        maximum: 14400,
      }),
    }),
    outputSchema: s.object(
      "The result of extending an OTP expiry time.",
      {
        ...statusMessageFields,
        expires_at: s.string("The new OTP expiry timestamp in UTC.", { format: "date-time" }),
      },
      { optional: ["status", "message", "expires_at"] },
    ),
  }),
  defineProviderAction(service, {
    name: "check_otp_status",
    operationType: "read",
    description: "Check the delivery and validity status of a MyOTP.App OTP message.",
    requiredScopes: [],
    inputSchema: s.object("The input for checking an OTP message status.", {
      message_id: s.string("The message identifier of the OTP to inspect."),
    }),
    outputSchema: s.object(
      "The current delivery and validity status of an OTP message.",
      {
        status: s.string("The delivery status returned by MyOTP.App."),
        is_valid: s.boolean("Whether the OTP is still active and valid."),
        expires_at: s.string("The OTP expiry timestamp in UTC.", { format: "date-time" }),
      },
      { optional: ["status", "is_valid", "expires_at"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_transactions_report",
    operationType: "read",
    description: "Retrieve a paginated MyOTP.App transaction report for a date range.",
    requiredScopes: [],
    inputSchema: s.object(
      "The filters and pagination for a MyOTP.App transaction report.",
      {
        start_date: s.string("The first report date in YYYY-MM-DD format.", { format: "date" }),
        end_date: s.string("The last report date in YYYY-MM-DD format.", { format: "date" }),
        page: s.integer("The one-based report page number.", { minimum: 1 }),
        per_page: s.integer("The maximum number of transactions to return.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { optional: ["start_date", "end_date", "page", "per_page"] },
    ),
    outputSchema: s.object("The MyOTP.App transaction report.", {
      transactions: s.array("The transactions in the requested report page.", transactionSchema),
    }),
  }),
];
