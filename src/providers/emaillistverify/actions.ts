import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "emaillistverify";

const noInputSchema = s.actionInput({}, [], "No input parameters are required for this action.");
const statusValues = [
  "ok",
  "unknown",
  "dead_server",
  "invalid_mx",
  "email_disabled",
  "antispam_system",
  "ok_for_all",
  "smtp_protocol",
  "invalid_syntax",
  "disposable",
  "spamtrap",
];
const emailStatusSchema = s.stringEnum(
  "The EmailListVerify deliverability status for the email address.",
  statusValues,
);
const emailInputSchema = s.actionInput(
  {
    email: s.email("The email address to verify with EmailListVerify."),
  },
  ["email"],
  "Input payload for verifying a single email address with EmailListVerify.",
);
const emailListIdSchema = s.nonEmptyString("The identifier of the uploaded EmailListVerify email list.");
const nullableStringSchema = s.nullableString("The provider value, or null when unavailable.");
const nullableIntegerSchema = s.nullableInteger("The provider integer value, or null when unavailable.", {
  minimum: 0,
});

export const emailListVerifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify a single email address with EmailListVerify's real-time API.",
    requiredScopes: [],
    inputSchema: emailInputSchema,
    outputSchema: s.actionOutput(
      {
        email: s.email("The email address that was verified."),
        status: emailStatusSchema,
      },
      "The plain text verification result normalized into a stable object.",
    ),
  }),
  defineProviderAction(service, {
    name: "verify_email_detailed",
    description: "Verify and enrich a single email address with EmailListVerify's detailed API.",
    requiredScopes: [],
    inputSchema: emailInputSchema,
    outputSchema: s.object(
      "The detailed EmailListVerify enrichment result for a single email address.",
      {
        email: s.email("The email address that was verified."),
        result: emailStatusSchema,
        account: s.string("The local part of the email address before the at sign."),
        domain: s.string("The domain part of the email address."),
        isRole: s.boolean("Whether the email address belongs to a role account."),
        isFree: s.boolean("Whether the email address uses a free email provider."),
        isNoReply: s.boolean("Whether the email address is a no-reply inbox."),
        mxServer: s.string("The MX server associated with the email domain."),
        mxServerIp: s.string("The IP address of the MX server."),
        esp: s.string("The detected email service provider."),
        firstName: s.string("The first name inferred from the email address, when available."),
        lastName: s.string("The last name inferred from the email address, when available."),
        gender: s.string("The gender inferred from the email address, when available."),
        tag: s.string("The plus-addressing tag, when present."),
        internalResult: s.string("The provider's internal processing result, when available."),
      },
      {
        required: ["email", "result", "account", "domain", "isRole", "isFree", "isNoReply"],
        optional: ["mxServer", "mxServerIp", "esp", "firstName", "lastName", "gender", "tag", "internalResult"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_credits",
    description: "Retrieve the available EmailListVerify on-demand and subscription credits.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.actionOutput(
      {
        onDemand: s.actionOutput(
          {
            available: s.nonNegativeInteger("Remaining balance of on-demand credits."),
          },
          "On-demand credits that never expire.",
        ),
        subscription: s.nullable(
          s.actionOutput(
            {
              available: s.nonNegativeInteger("Remaining subscription credits for the current period."),
              expiresAt: s.dateTime("The ISO 8601 expiration timestamp of the current subscription period."),
            },
            "Subscription credits for the current billing period.",
          ),
        ),
      },
      "The available EmailListVerify credit balances.",
    ),
  }),
  defineProviderAction(service, {
    name: "upload_email_list",
    description: "Upload one email list file to EmailListVerify for batch verification.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        fileName: s.nonEmptyString("The file name sent to EmailListVerify."),
        contentText: s.nonEmptyString("Plain text file content for csv or txt email lists."),
        contentBase64: s.nonEmptyString("Base64-encoded file content for csv, txt, or xlsx email lists."),
        quality: s.stringEnum("The verification quality requested for the uploaded email list.", ["standard", "high"]),
      },
      ["fileName"],
      "Input payload for uploading one email list to EmailListVerify. Exactly one of contentText or contentBase64 must be provided.",
    ),
    outputSchema: s.actionOutput(
      {
        emailListId: emailListIdSchema,
      },
      "The identifier returned after EmailListVerify accepts the uploaded email list.",
    ),
  }),
  defineProviderAction(service, {
    name: "check_disposable",
    description: "Check whether one email domain is disposable with EmailListVerify.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        domain: s.string("The email domain to check for disposable-email status.", { minLength: 1, maxLength: 255 }),
      },
      ["domain"],
      "Input payload for checking whether one email domain is disposable.",
    ),
    outputSchema: s.actionOutput(
      {
        domain: s.string("The email domain that was checked."),
        result: s.stringEnum("The disposability status returned for the email domain.", [
          "ok",
          "disposable",
          "dead_server",
          "invalid_mx",
          "unknown",
        ]),
        internalResult: nullableStringSchema,
        mxServer: nullableStringSchema,
        mxServerIp: nullableStringSchema,
      },
      "The disposable-domain verification result returned by EmailListVerify.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_email_list_progress",
    description: "Get the current progress of one uploaded EmailListVerify email list.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        emailListId: emailListIdSchema,
      },
      ["emailListId"],
      "Input payload for referencing one uploaded EmailListVerify email list.",
    ),
    outputSchema: s.actionOutput(
      {
        status: s.stringEnum("The current status of the uploaded email list.", [
          "uploaded",
          "processing",
          "finished",
          "inQueue",
          "starting",
          "error",
        ]),
        progress: s.integer("The percentage completion of the uploaded email list.", { minimum: 0, maximum: 100 }),
        credits: s.actionOutput(
          {
            charged: nullableIntegerSchema,
            returned: nullableIntegerSchema,
          },
          "Credit usage information for the uploaded email list.",
        ),
        name: s.string("The uploaded file name."),
        createdAt: s.dateTime("The ISO 8601 timestamp when the email list was uploaded."),
        updatedAt: s.dateTime("The ISO 8601 timestamp when the email list was last updated."),
      },
      "The progress information for one uploaded EmailListVerify email list.",
    ),
  }),
  defineProviderAction(service, {
    name: "download_email_list",
    description: "Download one finished EmailListVerify email list as base64 content.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        emailListId: emailListIdSchema,
        format: s.stringEnum("The output file format to request.", ["csv", "xlsx"]),
        results: s.array(
          "Only include rows whose verification result matches one of these statuses.",
          emailStatusSchema,
          {
            minItems: 1,
          },
        ),
      },
      ["emailListId"],
      "Input payload for downloading one finished EmailListVerify email list.",
    ),
    outputSchema: s.actionOutput(
      {
        fileName: s.string("The downloaded file name."),
        contentType: s.string("The response content type returned by EmailListVerify."),
        contentBase64: s.string("The downloaded file content encoded as base64."),
      },
      "The downloaded EmailListVerify email list encoded as base64 content.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_email_list",
    description: "Delete one finished EmailListVerify email list.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        emailListId: emailListIdSchema,
      },
      ["emailListId"],
      "Input payload for referencing one uploaded EmailListVerify email list.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the email list was deleted successfully."),
        emailListId: emailListIdSchema,
      },
      "The confirmation payload returned after deleting an EmailListVerify email list.",
    ),
  }),
];
