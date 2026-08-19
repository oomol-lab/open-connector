import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailbox_validator";

const emailInputSchema = (description: string) =>
  s.object(
    description,
    {
      email: s.email("The email address to check."),
    },
    { required: ["email"] },
  );

const nullableBooleanSchema = s.nullableBoolean(
  "MailboxValidator boolean signal, or null when the check is not applicable.",
);

const validateEmailOutputSchema = s.object(
  "MailboxValidator single email validation result.",
  {
    email_address: s.string("The input email address returned by MailboxValidator."),
    base_email_address: s.string("The sanitized base email address returned by MailboxValidator."),
    domain: s.string("The email domain returned by MailboxValidator."),
    is_free: nullableBooleanSchema,
    is_syntax: s.boolean("Whether the email address syntax is valid."),
    is_domain: nullableBooleanSchema,
    is_smtp: nullableBooleanSchema,
    is_verified: nullableBooleanSchema,
    is_server_down: nullableBooleanSchema,
    is_greylisted: nullableBooleanSchema,
    is_disposable: nullableBooleanSchema,
    is_suppressed: nullableBooleanSchema,
    is_role: nullableBooleanSchema,
    is_high_risk: nullableBooleanSchema,
    is_catchall: nullableBooleanSchema,
    is_dmarc_enforced: s.boolean("Whether the email domain enforces DMARC."),
    is_strict_spf: s.boolean("Whether the email domain uses strict SPF."),
    website_exist: s.boolean("Whether the email domain has a reachable website."),
    mailboxvalidator_score: s.number("MailboxValidator reputation score for the email address."),
    time_taken: s.number("Time taken by MailboxValidator to produce the result, in seconds."),
    status: s.boolean("Whether MailboxValidator considers the email address valid."),
    credits_available: s.integer("Number of validation credits currently available."),
  },
  {
    optional: [
      "base_email_address",
      "domain",
      "is_free",
      "is_syntax",
      "is_domain",
      "is_smtp",
      "is_verified",
      "is_server_down",
      "is_greylisted",
      "is_disposable",
      "is_suppressed",
      "is_role",
      "is_high_risk",
      "is_catchall",
      "is_dmarc_enforced",
      "is_strict_spf",
      "website_exist",
      "mailboxvalidator_score",
      "time_taken",
      "status",
      "credits_available",
    ],
  },
);

const disposableEmailOutputSchema = s.object(
  "MailboxValidator disposable email result.",
  {
    email_address: s.string("The input email address returned by MailboxValidator."),
    is_disposable: s.boolean("Whether the email address is from a disposable email provider."),
    credits_available: s.integer("Number of API credits currently available."),
  },
  { required: ["email_address", "is_disposable", "credits_available"] },
);

const freeEmailOutputSchema = s.object(
  "MailboxValidator free email provider result.",
  {
    email_address: s.string("The input email address returned by MailboxValidator."),
    is_free: s.boolean("Whether the email address is from a free email provider."),
    credits_available: s.integer("Number of API credits currently available."),
  },
  { required: ["email_address", "is_free", "credits_available"] },
);

export const mailboxValidatorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_email",
    description: "Validate a single email address and return MailboxValidator deliverability signals.",
    inputSchema: emailInputSchema("Input parameters for validating one email address."),
    outputSchema: validateEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_disposable_email",
    description: "Check whether an email address belongs to a disposable email provider.",
    inputSchema: emailInputSchema("Input parameters for checking a disposable email address."),
    outputSchema: disposableEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_free_email",
    description: "Check whether an email address belongs to a free email provider.",
    inputSchema: emailInputSchema("Input parameters for checking a free email provider."),
    outputSchema: freeEmailOutputSchema,
  }),
];
