import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kickbox";

const verifyEmailInputSchema = s.object("The input payload for verifying a single email address with Kickbox.", {
  email: s.email("The email address to verify."),
});

const verifyResultSchema = s.stringEnum("The overall verification result returned by Kickbox.", [
  "deliverable",
  "undeliverable",
  "risky",
  "unknown",
]);

const verifyEmailOutputSchema = s.object(
  "The single-email verification result returned by Kickbox.",
  {
    result: verifyResultSchema,
    reason: s.string("The provider reason that explains the verification result."),
    role: s.boolean("Whether the address is role-based, such as support@ or admin@."),
    free: s.boolean("Whether the address belongs to a free email provider."),
    disposable: s.boolean("Whether the address belongs to a disposable email provider."),
    accept_all: s.boolean("Whether the domain appears to accept all inbound email addresses."),
    sendex: s.number("Kickbox Sendex quality score between 0 and 1."),
    email: s.string("The normalized email address evaluated by Kickbox."),
    success: s.boolean("Whether Kickbox completed the verification request successfully."),
    user: s.string("The local part of the verified email address."),
    domain: s.string("The domain part of the verified email address."),
    did_you_mean: s.string("Suggested corrected email address when Kickbox detects a likely typo."),
  },
  { optional: ["user", "domain", "did_you_mean"] },
);

const checkDisposableEmailInputSchema = s.object(
  "The input payload for checking whether an email or domain is disposable.",
  {
    domain_or_email: s.nonEmptyString("The email address or domain to check for disposable-email status."),
  },
);

const checkDisposableEmailOutputSchema = s.object("The disposable-email lookup result returned by Kickbox.", {
  disposable: s.boolean("Whether the input email address or domain belongs to a disposable provider."),
});

export const kickboxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify whether a single email address is deliverable and retrieve Kickbox risk signals.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: verifyEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_disposable_email",
    description: "Check whether an email address or domain belongs to a disposable email provider.",
    inputSchema: checkDisposableEmailInputSchema,
    outputSchema: checkDisposableEmailOutputSchema,
  }),
];
