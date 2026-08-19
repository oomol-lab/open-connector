import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailcheck";

const mxProviderTypeSchema = s.stringEnum(["mailbox", "hosting", "email_api", "security_gateway", "forwarding"], {
  description: "The provider category assigned to the detected MX provider.",
});

const mxProviderGradeSchema = s.stringEnum(["enterprise", "professional", "standard", "basic"], {
  description: "The onboarding or commitment grade assigned to the detected MX provider.",
});

const mxRecordSchema = s.object(
  "One MX record returned by UserCheck.",
  {
    hostname: s.string("The hostname of the MX server."),
    priority: s.integer("The priority assigned to the MX record."),
  },
  { required: ["hostname", "priority"] },
);

const mxProviderSchema = s.object(
  "One recognized MX provider returned by UserCheck.",
  {
    slug: s.string("The stable provider identifier returned by UserCheck."),
    type: mxProviderTypeSchema,
    grade: mxProviderGradeSchema,
  },
  { required: ["slug", "type", "grade"] },
);

const accountPlanSchema = s.object(
  "The current UserCheck plan information.",
  {
    name: s.string("The name of the current UserCheck plan."),
    credits: s.integer("The total credits included in the current plan."),
    rate_limit: s.integer("The maximum number of requests per second allowed by the current plan."),
  },
  { required: ["name", "credits", "rate_limit"] },
);

const accountUserSchema = s.object(
  "The current UserCheck account owner information.",
  {
    name: s.string("The name of the UserCheck account owner."),
    email: s.email("The email address of the UserCheck account owner."),
  },
  { required: ["name", "email"] },
);

const statusPayloadSchema = s.object(
  "The payload returned by the UserCheck status endpoint.",
  {
    status: s.string("The top-level status string returned by the status endpoint."),
    account: s.object(
      "The account block returned by the UserCheck status endpoint.",
      {
        plan: accountPlanSchema,
        user: accountUserSchema,
      },
      { required: ["plan", "user"] },
    ),
    usage: s.object(
      "The usage block returned by the UserCheck status endpoint.",
      {
        limit: s.integer("The total usage limit for the current billing period."),
        current: s.integer("The number of credits already used in the current billing period."),
        remaining: s.integer("The number of credits remaining in the current billing period."),
        reset_at: s.string("The ISO 8601 timestamp when the current billing period resets."),
      },
      { required: ["limit", "current", "remaining", "reset_at"] },
    ),
  },
  { required: ["status", "account", "usage"] },
);

const emailPayloadSchema = s.object(
  "The payload returned by the UserCheck email validation endpoint.",
  {
    status: s.integer("The HTTP-style status code returned by the email endpoint."),
    email: s.string("The normalized email address returned by UserCheck."),
    normalized_email: s.string("The normalized email address returned after alias or typo normalization."),
    domain: s.string("The domain extracted from the validated email address."),
    domain_authority: s.nullableInteger("The optional 0 to 100 domain authority score returned by UserCheck."),
    tld_trust: s.nullableInteger("The optional TLD trust score returned by UserCheck."),
    domain_age_in_days: s.nullableInteger("The optional number of days since the domain was registered."),
    mx: s.boolean("Whether the email domain has valid MX records."),
    mx_records: s.array("The MX records returned for the email domain.", mxRecordSchema),
    mx_providers: s.array("The recognized MX providers returned for the email domain.", mxProviderSchema),
    disposable: s.boolean("Whether the email is disposable."),
    public_domain: s.boolean("Whether the email uses a public mailbox domain."),
    relay_domain: s.boolean("Whether the email uses a forwarding or relay domain."),
    alias: s.boolean("Whether the original email included an alias component according to UserCheck."),
    role_account: s.boolean("Whether the email is a role account."),
    spam: s.boolean("Whether the email domain is associated with spam activity."),
    did_you_mean: s.nullableString("The typo correction suggestion returned by UserCheck, if any."),
    blocklisted: s.boolean("Whether the email domain appears on the account blocklist."),
    disposable_provider: s.nullableString("The disposable provider domain returned by UserCheck when available."),
  },
  {
    required: [
      "status",
      "email",
      "normalized_email",
      "domain",
      "mx",
      "mx_records",
      "mx_providers",
      "disposable",
      "public_domain",
      "relay_domain",
      "alias",
      "role_account",
      "spam",
    ],
    optional: [
      "domain_authority",
      "tld_trust",
      "domain_age_in_days",
      "did_you_mean",
      "blocklisted",
      "disposable_provider",
    ],
    additionalProperties: true,
  },
);

const domainPayloadSchema = s.object(
  "The payload returned by the UserCheck domain validation endpoint.",
  {
    status: s.integer("The HTTP-style status code returned by the domain endpoint."),
    domain: s.string("The normalized domain returned by UserCheck."),
    domain_authority: s.nullableInteger("The optional 0 to 100 domain authority score returned by UserCheck."),
    tld_trust: s.nullableInteger("The optional TLD trust score returned by UserCheck."),
    domain_age_in_days: s.nullableInteger("The optional number of days since the domain was registered."),
    mx: s.boolean("Whether the domain has valid MX records."),
    mx_records: s.array("The MX records returned for the validated domain.", mxRecordSchema),
    mx_providers: s.array("The recognized MX providers returned for the validated domain.", mxProviderSchema),
    disposable: s.boolean("Whether the domain belongs to a disposable email provider."),
    public_domain: s.boolean("Whether the domain is a public email service."),
    relay_domain: s.boolean("Whether the domain is used for email forwarding."),
    spam: s.boolean("Whether the domain is associated with spam activity."),
    did_you_mean: s.nullableString("The typo correction suggestion returned by UserCheck, if any."),
    blocklisted: s.boolean("Whether the domain appears on the account blocklist."),
    disposable_provider: s.nullableString("The disposable provider domain returned by UserCheck when available."),
  },
  {
    required: [
      "status",
      "domain",
      "mx",
      "mx_records",
      "mx_providers",
      "disposable",
      "public_domain",
      "relay_domain",
      "spam",
    ],
    optional: [
      "domain_authority",
      "tld_trust",
      "domain_age_in_days",
      "did_you_mean",
      "blocklisted",
      "disposable_provider",
    ],
    additionalProperties: true,
  },
);

export const mailcheckActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_status",
    description: "Retrieve UserCheck account information, plan details, and current API usage.",
    inputSchema: s.object("Input payload for retrieving UserCheck account status and usage.", {}),
    outputSchema: s.object(
      "The connector response for the UserCheck status endpoint.",
      {
        status: statusPayloadSchema,
      },
      { required: ["status"] },
    ),
  }),
  defineProviderAction(service, {
    name: "verify_email",
    description: "Validate a single email address and return UserCheck deliverability and risk signals.",
    inputSchema: s.object(
      "Input payload for validating a single email address with UserCheck.",
      {
        email: s.email("The email address to validate with UserCheck."),
      },
      { required: ["email"] },
    ),
    outputSchema: s.object(
      "The connector response for the UserCheck email validation endpoint.",
      {
        email: emailPayloadSchema,
      },
      { required: ["email"] },
    ),
  }),
  defineProviderAction(service, {
    name: "validate_domain",
    description: "Validate a domain and return UserCheck domain-level risk and MX signals.",
    inputSchema: s.object(
      "Input payload for validating a domain with UserCheck.",
      {
        domain: s.nonEmptyString("The domain to validate with UserCheck."),
      },
      { required: ["domain"] },
    ),
    outputSchema: s.object(
      "The connector response for the UserCheck domain validation endpoint.",
      {
        domain: domainPayloadSchema,
      },
      { required: ["domain"] },
    ),
  }),
];
