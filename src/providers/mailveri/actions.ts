import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailveri";

const verifyEmailInputSchema = s.object("The input payload for verifying a single email address with MailVeri.", {
  email: s.email("The email address to verify."),
});

const verificationStatusSchema = s.stringEnum("The deliverability status returned by MailVeri.", [
  "VALID",
  "INVALID",
  "DISPOSABLE",
  "ROLE_ACCOUNT",
  "CATCH_ALL",
  "FULL_INBOX",
  "UNKNOWN",
]);

const verifyEmailOutputSchema = s.object(
  "The single-email verification result returned by MailVeri.",
  {
    status: verificationStatusSchema,
    email: s.string("The email address evaluated by MailVeri."),
    message: s.string("The human-readable message returned by MailVeri."),
    quality_score: s.integer("Deliverability score between 0 and 100.", { minimum: 0, maximum: 100 }),
    is_forwarding: s.boolean("Whether the recipient domain routes incoming mail through an email forwarding relay."),
    credits_used: s.integer(
      "Credits charged for this call: 1 on conclusive statuses, 0 on UNKNOWN results and error responses.",
    ),
    balance: s.integer("Remaining account verification credit balance after this call."),
  },
  { optional: ["message", "quality_score", "is_forwarding", "credits_used", "balance"] },
);

const getBalanceInputSchema = s.object("The input payload for reading the MailVeri credit balance.", {});

const getBalanceOutputSchema = s.object(
  "The MailVeri account credit balance.",
  {
    balance: s.integer("Remaining account verification credit balance."),
    message: s.string("The human-readable message returned by MailVeri."),
    daily_limit: s.integer("Daily verification limit on daily-quota plans."),
    daily_remaining: s.integer("Verifications left today on daily-quota plans."),
    daily_used: s.integer("Verifications used today on daily-quota plans."),
  },
  { optional: ["message", "daily_limit", "daily_remaining", "daily_used"] },
);

export const mailveriActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "verify_email",
    operationType: "read",
    description:
      "Verify whether a single email address is deliverable and get its MailVeri status (VALID, INVALID, DISPOSABLE, ROLE_ACCOUNT, CATCH_ALL, FULL_INBOX or UNKNOWN), quality score and forwarding flag. Uses 1 credit; UNKNOWN results are free.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: verifyEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_balance",
    operationType: "read",
    description: "Get the remaining MailVeri verification credit balance. This call is free.",
    inputSchema: getBalanceInputSchema,
    outputSchema: getBalanceOutputSchema,
  }),
];
