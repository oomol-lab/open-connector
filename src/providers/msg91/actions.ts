import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "msg91";

const binaryFlagSchema = s.boolean("Whether MSG91 should enable this optional flag.");

const variableValuesSchema = s.record(
  "Template variable values keyed by the exact MSG91 template placeholder name.",
  s.nonEmptyString("One template variable value."),
);

const flowSmsRecipientSchema = s.actionInput(
  {
    mobile: s.nonEmptyString(
      "Recipient mobile number in international format with country code and without a plus sign.",
    ),
    variables: variableValuesSchema,
  },
  ["mobile"],
  "One recipient for an MSG91 Flow SMS template.",
);

const rawResponseSchema = s.looseObject("The raw JSON object returned by MSG91.");

const acceptedMessageOutputSchema = s.actionOutput(
  {
    accepted: s.boolean("Whether MSG91 accepted the message submission."),
    type: s.nonEmptyString("The MSG91 response type."),
    message: s.nullableString("The MSG91 response message when returned."),
    requestId: s.nullableString("The MSG91 request identifier when returned."),
    raw: rawResponseSchema,
  },
  "A normalized MSG91 message submission response.",
);

const otpSubmissionOutputSchema = s.actionOutput(
  {
    sent: s.boolean("Whether MSG91 accepted the OTP send request."),
    type: s.nonEmptyString("The MSG91 response type."),
    message: s.nullableString("The MSG91 response message when returned."),
    requestId: s.nullableString("The MSG91 OTP request identifier when returned."),
    raw: rawResponseSchema,
  },
  "A normalized MSG91 OTP send response.",
);

const verifyOtpOutputSchema = s.actionOutput(
  {
    verified: s.boolean("Whether MSG91 reported that the OTP was verified."),
    type: s.nonEmptyString("The MSG91 response type."),
    message: s.nullableString("The MSG91 verification message when returned."),
    code: s.nullableString("The MSG91 response code when returned."),
    raw: rawResponseSchema,
  },
  "A normalized MSG91 OTP verification response.",
);

const resendOtpOutputSchema = s.actionOutput(
  {
    sent: s.boolean("Whether MSG91 accepted the OTP resend request."),
    type: s.nonEmptyString("The MSG91 response type."),
    message: s.nullableString("The MSG91 response message when returned."),
    raw: rawResponseSchema,
  },
  "A normalized MSG91 OTP resend response.",
);

export const msg91Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_flow_sms",
    operationType: "write",
    description: "Send an SMS through an approved MSG91 Flow template.",
    inputSchema: s.actionInput(
      {
        templateId: s.nonEmptyString("The MSG91 Flow SMS template ID from the MSG91 dashboard."),
        recipients: s.array("The SMS recipients and template variables to send.", flowSmsRecipientSchema, {
          minItems: 1,
        }),
        shortUrl: binaryFlagSchema,
        shortUrlExpirySeconds: s.positiveInteger(
          "The optional short URL expiry time in seconds when shortUrl is enabled.",
        ),
        realTimeResponse: binaryFlagSchema,
      },
      ["templateId", "recipients"],
      "Input parameters for sending an MSG91 Flow SMS template.",
    ),
    outputSchema: acceptedMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_otp",
    operationType: "write",
    description: "Generate or send an OTP with an MSG91 OTP template.",
    inputSchema: s.actionInput(
      {
        mobile: s.nonEmptyString(
          "Recipient mobile number in international format with country code and without a plus sign.",
        ),
        templateId: s.nonEmptyString("The MSG91 OTP template ID from the MSG91 dashboard."),
        otp: s.nonEmptyString("A caller-supplied OTP value to send instead of an auto-generated OTP."),
        otpLength: s.integer("The number of digits for an auto-generated OTP.", {
          minimum: 4,
          maximum: 9,
        }),
        otpExpiryMinutes: s.integer("The OTP expiry duration in minutes.", {
          minimum: 1,
          maximum: 10080,
        }),
        userIp: s.nonEmptyString("The end user's IP address for MSG91 security tracking."),
        unicode: binaryFlagSchema,
        invisible: binaryFlagSchema,
        realTimeResponse: binaryFlagSchema,
        variables: variableValuesSchema,
      },
      ["mobile", "templateId"],
      "Input parameters for sending an MSG91 OTP.",
    ),
    outputSchema: otpSubmissionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_otp",
    operationType: "read",
    description: "Verify an OTP previously sent through MSG91.",
    inputSchema: s.actionInput(
      {
        mobile: s.nonEmptyString("Mobile number in international format with country code and without a plus sign."),
        otp: s.nonEmptyString("The OTP value entered by the user."),
      },
      ["mobile", "otp"],
      "Input parameters for verifying an MSG91 OTP.",
    ),
    outputSchema: verifyOtpOutputSchema,
  }),
  defineProviderAction(service, {
    name: "resend_otp",
    operationType: "write",
    description: "Resend an existing MSG91 OTP by text message or voice call.",
    inputSchema: s.actionInput(
      {
        mobile: s.nonEmptyString("Mobile number in international format with country code and without a plus sign."),
        retryType: s.stringEnum("The MSG91 retry channel for resending the OTP.", ["voice", "text"]),
      },
      ["mobile", "retryType"],
      "Input parameters for resending an MSG91 OTP.",
    ),
    outputSchema: resendOtpOutputSchema,
  }),
];
