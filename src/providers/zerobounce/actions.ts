import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zerobounce";

const emptyInputSchema = s.actionInput({}, [], "This action does not require any input.");
const activityInDaysSchema = s.stringEnum("The last activity bucket returned by ZeroBounce when available.", [
  "30",
  "60",
  "90",
  "180",
  "365",
  "365+",
]);
const emailToValidateSchema = s.nonEmptyString("The raw email address to validate with ZeroBounce.");
const filterRuleSchema = s.stringEnum("Whether the filter rule should allow or block matching addresses.", [
  "allow",
  "block",
]);
const filterTargetSchema = s.stringEnum("The filter scope used by ZeroBounce for this rule.", [
  "email",
  "domain",
  "mx",
  "tld",
]);

const optionalUsageIntegerFields = [
  "status_valid",
  "status_invalid",
  "status_catch_all",
  "status_do_not_mail",
  "status_spamtrap",
  "status_unknown",
  "sub_status_toxic",
  "sub_status_disposable",
  "sub_status_role_based",
  "sub_status_possible_trap",
  "sub_status_global_suppression",
  "sub_status_timeout_exceeded",
  "sub_status_mail_server_temporary_error",
  "sub_status_mail_server_did_not_respond",
  "sub_status_greylisted",
  "sub_status_antispam_system",
  "sub_status_does_not_accept_mail",
  "sub_status_exception_occurred",
  "sub_status_failed_syntax_check",
  "sub_status_mailbox_not_found",
  "sub_status_unroutable_ip_address",
  "sub_status_possible_typo",
  "sub_status_no_dns_entries",
  "sub_status_role_based_catch_all",
  "sub_status_mailbox_quota_exceeded",
  "sub_status_forcible_disconnect",
  "sub_status_failed_smtp_connection",
  "sub_status_leading_period_removed",
  "sub_status_alias_address",
  "sub_status_mx_forward",
  "sub_status_alternate",
  "sub_status_blocked",
  "sub_status_allowed",
];

const nullableProfileStringFields = [
  "smtp_provider",
  "firstname",
  "lastname",
  "gender",
  "country",
  "region",
  "city",
  "zipcode",
  "domain_age_days",
];

const getApiUsageInputSchema = s.actionInput(
  {
    start_date: s.date("The inclusive usage period start date in YYYY-MM-DD format."),
    end_date: s.date("The inclusive usage period end date in YYYY-MM-DD format."),
  },
  ["start_date", "end_date"],
  "The input payload for reading ZeroBounce API usage metrics.",
);

const validateEmailInputSchema = s.actionInput(
  {
    email: emailToValidateSchema,
    ip_address: s.string("The optional client IP address used for geo enrichment."),
    credits_info: s.boolean("Whether ZeroBounce should include remaining credits information in the response."),
  },
  ["email"],
  "The input payload for validating a single email address.",
);

const getActivityDataInputSchema = s.actionInput(
  {
    email: s.email("The email address used for this ZeroBounce request."),
  },
  ["email"],
  "The input payload for reading email activity data.",
);

const createFilterRuleInputSchema = s.actionInput(
  {
    rule: filterRuleSchema,
    target: filterTargetSchema,
    value: s.nonEmptyString("The filter value such as an email address, domain, MX record, or TLD."),
  },
  ["rule", "target", "value"],
  "The input payload for creating or updating a custom ZeroBounce filter rule.",
);

const usageProperties: Record<string, JsonSchema> = {
  total: s.integer("The total number of API validations in the time range."),
  start_date: s.date("The inclusive usage period start date returned by ZeroBounce."),
  end_date: s.date("The inclusive usage period end date returned by ZeroBounce."),
};
for (const field of optionalUsageIntegerFields) {
  usageProperties[field] = s.integer(`The number of validations with ${field}.`);
}

const validateEmailProperties: Record<string, JsonSchema> = {
  address: s.string("The validated email address returned by ZeroBounce."),
  status: s.stringEnum("The top-level validation status returned by ZeroBounce.", [
    "valid",
    "invalid",
    "catch-all",
    "unknown",
    "spamtrap",
    "abuse",
    "do_not_mail",
  ]),
  free_email: s.boolean("Whether the email belongs to a free email provider."),
  mx_found: s.boolean("Whether ZeroBounce found MX records for the domain."),
  sub_status: s.string("The more specific ZeroBounce validation sub-status."),
  mx_record: s.string("The MX record returned by ZeroBounce."),
  did_you_mean: s.nullableString("The correction suggestion returned by ZeroBounce, if any."),
  domain: s.string("The domain portion of the validated email address."),
  account: s.string("The local-part portion of the validated email address."),
  active_in_days: activityInDaysSchema,
  processed_at: s.string("The ZeroBounce processing timestamp, if any."),
};
for (const field of nullableProfileStringFields) {
  validateEmailProperties[field] = s.nullableString(
    `The ${field.replaceAll("_", " ")} value inferred by ZeroBounce, or null when unavailable.`,
  );
}

const filterEntrySchema = s.object("One ZeroBounce custom filter rule entry.", {
  rule: filterRuleSchema,
  target: filterTargetSchema,
  value: s.string("The filter value returned by ZeroBounce."),
});

export const zerobounceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credit_balance",
    description: "Get the current ZeroBounce credit balance.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { credits: s.integer("The remaining ZeroBounce credits.") },
      "The ZeroBounce credit balance response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_api_usage",
    description: "Get ZeroBounce API usage metrics for a date range.",
    inputSchema: getApiUsageInputSchema,
    outputSchema: s.object("The ZeroBounce API usage metrics response.", usageProperties, {
      optional: optionalUsageIntegerFields,
      additionalProperties: true,
    }),
  }),
  defineProviderAction(service, {
    name: "validate_email",
    description: "Validate a single email address with ZeroBounce in real time.",
    inputSchema: validateEmailInputSchema,
    outputSchema: s.object("The ZeroBounce single email validation response.", validateEmailProperties, {
      optional: [
        "sub_status",
        "mx_record",
        "did_you_mean",
        "domain",
        "account",
        "active_in_days",
        "processed_at",
        ...nullableProfileStringFields,
      ],
      additionalProperties: true,
    }),
  }),
  defineProviderAction(service, {
    name: "get_activity_data",
    description: "Get ZeroBounce email activity data for one email address.",
    inputSchema: getActivityDataInputSchema,
    outputSchema: s.actionOutput(
      {
        found: s.boolean("Whether ZeroBounce found activity data for the email address."),
        active_in_days: activityInDaysSchema,
      },
      "The ZeroBounce activity data response.",
      ["found"],
    ),
  }),
  defineProviderAction(service, {
    name: "create_filter_rule",
    description: "Create or update one ZeroBounce custom allow/block filter rule.",
    inputSchema: createFilterRuleInputSchema,
    outputSchema: s.actionOutput(
      { message: s.string("The confirmation message returned by ZeroBounce.") },
      "The ZeroBounce custom filter rule mutation response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_filter_rules",
    description: "List the current ZeroBounce custom allow/block filter rules.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      { filters: s.array("The custom allow/block rules currently configured in ZeroBounce.", filterEntrySchema) },
      "The ZeroBounce list filter rules response.",
    ),
  }),
];
