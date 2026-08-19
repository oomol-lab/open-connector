import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "emailable";

const emptyInputSchema = s.actionInput({}, [], "No input is required for this action.");
const batchIdSchema = s.nonEmptyString("The unique batch identifier returned by Emailable batch creation.");
const verificationStateSchema = s.stringEnum("The verification state returned by Emailable.", [
  "deliverable",
  "undeliverable",
  "risky",
  "unknown",
]);
const verificationResultSchema = s.object(
  "The single-email verification result returned by Emailable.",
  {
    email: s.email("The normalized email address verified by Emailable."),
    state: verificationStateSchema,
    reason: s.string("The provider reason returned by Emailable for the verification result."),
    score: s.nonNegativeInteger("The Emailable deliverability score from 0 to 100."),
    user: s.string("The local part of the verified email address."),
    domain: s.string("The domain part of the verified email address."),
    free: s.boolean("Whether the email is hosted by a free email provider."),
    role: s.boolean("Whether the email is a role-based address such as support@ or info@."),
    accept_all: s.boolean("Whether the domain appears to accept all inbound email addresses."),
    disposable: s.boolean("Whether the email belongs to a disposable or temporary email provider."),
    did_you_mean: s.string("Suggested corrected email address when Emailable detects a likely typo."),
    mx_record: s.string("The MX record used during verification."),
    smtp_provider: s.string("The SMTP provider identified for the email domain."),
    no_reply: s.boolean("Whether the address is a no-reply address."),
    mailbox_full: s.boolean("Whether the mailbox appears to be full."),
    first_name: s.string("The first name inferred from the email address, when available."),
    last_name: s.string("The last name inferred from the email address, when available."),
    full_name: s.string("The full name inferred from the email address, when available."),
    gender: s.string("The gender inferred from the email address, when available."),
    tag: s.string("The tag portion of the email address, such as the value after a plus sign."),
    duration: s.number("The verification duration in seconds."),
  },
  {
    required: ["email", "state", "reason"],
    optional: [
      "score",
      "user",
      "domain",
      "free",
      "role",
      "accept_all",
      "disposable",
      "did_you_mean",
      "mx_record",
      "smtp_provider",
      "no_reply",
      "mailbox_full",
      "first_name",
      "last_name",
      "full_name",
      "gender",
      "tag",
      "duration",
    ],
    additionalProperties: true,
  },
);
const countSummarySchema = s.looseObject(
  "Summary counts grouped by verification state or provider reason for the Emailable batch.",
);

export const emailableActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Retrieve Emailable account information including owner email and available credits.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        owner_email: s.email("The email address of the Emailable account owner."),
        available_credits: s.nonNegativeInteger("The number of verification credits currently available."),
      },
      "The Emailable account information returned by the account endpoint.",
    ),
  }),
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify a single email address and return Emailable deliverability signals.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        email: s.email("The email address to verify with Emailable."),
      },
      ["email"],
      "Input payload for verifying a single email address with Emailable.",
    ),
    outputSchema: verificationResultSchema,
  }),
  defineProviderAction(service, {
    name: "verify_batch_emails",
    description: "Create an Emailable batch verification job for a list of email addresses.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        emails: s.array(
          "The list of email addresses to verify in the Emailable batch request.",
          s.email("An email address included in the batch verification request."),
          {
            minItems: 2,
            maxItems: 50000,
          },
        ),
      },
      ["emails"],
      "Input payload for creating an Emailable batch verification job.",
    ),
    outputSchema: s.actionOutput(
      {
        id: batchIdSchema,
        message: s.string("The status message returned after Emailable creates the batch."),
      },
      "The response returned after Emailable creates a batch verification job.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_batch_status",
    description: "Retrieve the latest Emailable status and results for an existing batch verification job.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        batch_id: batchIdSchema,
      },
      ["batch_id"],
      "Input payload for retrieving the status of an Emailable batch verification job.",
    ),
    outputSchema: s.object(
      "The batch status payload returned by Emailable.",
      {
        id: batchIdSchema,
        message: s.string("The current status message for the Emailable batch."),
        processed: s.nonNegativeInteger("The number of emails processed so far in the batch."),
        total: s.nonNegativeInteger("The total number of emails submitted in the batch."),
        emails: s.array(
          "The individual email verification results when Emailable returns inline batch results.",
          verificationResultSchema,
        ),
        download_file: s.url("The download URL for large batch result exports, when Emailable returns one."),
        total_counts: countSummarySchema,
        reason_counts: countSummarySchema,
      },
      {
        required: ["id", "message"],
        optional: ["processed", "total", "emails", "download_file", "total_counts", "reason_counts"],
        additionalProperties: true,
      },
    ),
  }),
];
