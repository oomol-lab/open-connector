import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailboxlayer";

const optionalFlagDescription =
  "Whether to enable this Mailboxlayer validation check. When provided, the flag is sent as 1 or 0.";

const checkEmailInputSchema = s.object(
  "Input parameters for validating a single email address with Mailboxlayer.",
  {
    email: s.email("The email address to validate."),
    smtp: s.boolean("Whether to perform the SMTP validation check."),
    format: s.boolean("Whether to enable pretty-printed JSON output for debugging."),
    mx: s.boolean("Whether to check whether the domain has MX records."),
    free: s.boolean(optionalFlagDescription),
    role: s.boolean(optionalFlagDescription),
    catch_all: s.boolean(optionalFlagDescription),
    disposable: s.boolean(optionalFlagDescription),
  },
  { optional: ["smtp", "format", "mx", "free", "role", "catch_all", "disposable"] },
);

const checkEmailOutputSchema = s.object(
  "Mailboxlayer email validation result.",
  {
    email: s.string("The validated email address."),
    did_you_mean: s.string("Suggested corrected email address when a typo is detected."),
    user: s.string("The local part of the email address."),
    domain: s.string("The domain part of the email address."),
    format_valid: s.boolean("Whether the email address format is valid."),
    mx_found: s.boolean("Whether MX records were found for the email domain."),
    smtp_check: s.boolean("Whether the SMTP check succeeded."),
    catch_all: s.nullableBoolean("Whether the domain appears to accept all addresses."),
    role: s.boolean("Whether the address is role-based, such as support@ or admin@."),
    disposable: s.boolean("Whether the address belongs to a disposable email provider."),
    free: s.boolean("Whether the address belongs to a free email provider."),
    score: s.number("Mailboxlayer quality score between 0 and 1."),
  },
  {
    optional: [
      "user",
      "domain",
      "format_valid",
      "mx_found",
      "smtp_check",
      "catch_all",
      "role",
      "disposable",
      "free",
      "score",
    ],
  },
);

export const mailboxlayerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "check_email",
    description: "Validate a single email address and return Mailboxlayer quality signals.",
    inputSchema: checkEmailInputSchema,
    outputSchema: checkEmailOutputSchema,
  }),
];
