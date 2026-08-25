import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clearout";

const emptyInputSchema = s.actionInput({}, [], "This action does not require any input.");
const timeoutFieldSchema = s.integer("Request wait time in milliseconds.", { minimum: 1, maximum: 180000 });
const verifyEmailInputSchema = s.object(
  "The input payload for this action.",
  {
    email: s.email("Email address to verify."),
    timeout: timeoutFieldSchema,
  },
  { optional: ["timeout"] },
);
const creditsDetailSchema = s.looseObject("The Clearout credits detail object.", {
  available: s.integer("The remaining available credits."),
  subs: s.nullableString("The current subscription label or identifier."),
  available_daily_verify_limit: s.nullableString("The remaining daily verify limit."),
  reset_daily_verify_limit_date: s.nullableString("The next daily verify limit reset date."),
  total: s.integer("The total credits in the current plan."),
});
const creditsOutputSchema = s.object("The Clearout available credits response.", {
  status: s.string("The upstream Clearout response status."),
  data: s.object(
    "The Clearout credits response data.",
    {
      available_credits: s.integer("The remaining available credits."),
      credits: creditsDetailSchema,
      low_credit_balance_min_threshold: s.nullableInteger("The low credit balance alert threshold."),
    },
    { optional: ["low_credit_balance_min_threshold"] },
  ),
});
const verifySubStatusSchema = s.looseObject("The verification sub-status returned by Clearout.", {
  code: s.integer("The upstream verification sub-status code."),
  desc: s.string("The upstream verification sub-status description."),
});
const verifyDetailInfoSchema = s.looseObject("Additional verification details returned by Clearout.", {
  account: s.string("The account-level verification detail."),
  domain: s.string("The domain-level verification detail."),
});
const instantVerifyDataSchema = s.looseObject("The Clearout instant verification result.", {
  email_address: s.string("The email address returned by Clearout."),
  safe_to_send: s.string("Whether Clearout marks the address safe to send."),
  status: s.string("The verification status returned by Clearout."),
  verified_on: s.string("The verification timestamp returned by Clearout."),
  time_taken: s.integer("The verification latency in milliseconds."),
  sub_status: s.nullable(verifySubStatusSchema),
  detail_info: s.nullable(verifyDetailInfoSchema),
  disposable: s.string("Whether the address is disposable."),
  free: s.string("Whether the address belongs to a free email provider."),
  role: s.string("Whether the address is role-based."),
  gibberish: s.string("Whether the address looks like gibberish."),
  suggested_email_address: s.nullableString("The suggested corrected email address, if any."),
  profile: s.nullableString("The associated profile reference, if any."),
  bounce_type: s.nullableString("The bounce type classification, if any."),
});
const instantVerifyOutputSchema = s.object("The Clearout instant email verification response.", {
  status: s.string("The upstream Clearout response status."),
  data: instantVerifyDataSchema,
});
const attributeVerifyDataSchema = s.looseObject("The Clearout attribute verification result.", {
  email_address: s.string("The email address returned by Clearout."),
  verified_on: s.string("The verification timestamp returned by Clearout."),
  time_taken: s.integer("The verification latency in milliseconds."),
  catchall: s.string("Whether the address is catch-all."),
  disposable: s.string("Whether the address is disposable."),
  free: s.string("Whether the address belongs to a free email provider."),
  role: s.string("Whether the address is role-based."),
  gibberish: s.string("Whether the address looks like gibberish."),
  business_account: s.string("Whether the address is a business account."),
});
const attributeVerifyOutputSchema = s.object("The Clearout attribute verification response.", {
  status: s.string("The upstream Clearout response status."),
  data: attributeVerifyDataSchema,
});

export const clearoutActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_available_credits",
    description: "Get the current Clearout credit balance and daily verification limits.",
    inputSchema: emptyInputSchema,
    outputSchema: creditsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "instant_verify_email",
    description: "Verify an email address in real time and return the full Clearout verification result.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: instantVerifyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_catch_all_email",
    description: "Check whether an email address belongs to a catch-all domain.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: attributeVerifyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_disposable_email",
    description: "Check whether an email address belongs to a disposable email service.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: attributeVerifyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_free_account_email",
    description: "Check whether an email address belongs to a free email provider.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: attributeVerifyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_role_account_email",
    description: "Check whether an email address is a role-based account.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: attributeVerifyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_gibberish_email",
    description: "Check whether an email address looks like a gibberish account.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: attributeVerifyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_business_account_email",
    description: "Check whether an email address belongs to a business account.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: attributeVerifyOutputSchema,
  }),
];
