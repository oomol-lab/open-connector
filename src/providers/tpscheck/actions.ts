import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tpscheck";

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const lineDetailsSchema = s.looseObject("Line details returned by TPSCheck in the v2 phone check response.", {
  type: nonEmptyString("Line type returned by TPSCheck, such as landline or mobile."),
  original_carrier: nonEmptyString("Original carrier name returned by TPSCheck for the phone number."),
  location: nonEmptyString("Location returned by TPSCheck for the phone number."),
  country: nonEmptyString("Country or nation name returned by TPSCheck."),
  prefix: nonEmptyString("Dialling prefix returned by TPSCheck for the phone number."),
});
const reachabilitySchema = s.looseObject("Reachability details returned by TPSCheck in the v2 phone check response.", {
  status: nonEmptyString("Reachability status returned by TPSCheck."),
  confidence: nonEmptyString("Reachability confidence returned by TPSCheck."),
});
const riskSchema = s.looseObject("Risk scoring block returned by TPSCheck v2 plans when available.", {
  score: s.integer("Compliance risk score returned by TPSCheck."),
  level: nonEmptyString("Risk level returned by TPSCheck, such as LOW or CRITICAL."),
  factors: s.anyOf("Risk factors returned by TPSCheck when risk scoring is available.", [
    nonEmptyString("One textual risk factor returned by TPSCheck."),
    s.stringArray("List of risk factors returned by TPSCheck.", {
      itemDescription: "One textual risk factor returned by TPSCheck.",
    }),
  ]),
});
const singleCheckResultSchema = s.looseRequiredObject(
  "Normalized TPSCheck v2 result for one phone number.",
  {
    input: nonEmptyString("Phone number as submitted to TPSCheck."),
    e164: nonEmptyString("E.164 formatted phone number returned by TPSCheck."),
    valid: s.boolean("Whether TPSCheck considers the phone number valid."),
    line: lineDetailsSchema,
    reachability: reachabilitySchema,
    tps: s.boolean("Whether the number is registered with the TPS."),
    ctps: s.boolean("Whether the number is registered with the CTPS."),
    risk: riskSchema,
  },
  { optional: ["e164", "line", "reachability", "tps", "ctps", "risk"] },
);

export const tpscheckActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credits",
    operationType: "read",
    description: "Retrieve current TPSCheck usage, remaining requests, and plan reset details.",
    inputSchema: s.actionInput({}, [], "Input payload for retrieving the current TPSCheck credits summary."),
    outputSchema: s.looseRequiredObject("Current TPSCheck credits and usage summary.", {
      requests_used: s.integer("Number of API requests used in the current billing period."),
      requests_remaining: s.integer("Number of API requests remaining in the current billing period."),
      monthly_limit: s.integer("Monthly request limit for the current TPSCheck plan."),
      plan: nonEmptyString("Current TPSCheck subscription plan name."),
      reset_date: nonEmptyString("ISO 8601 timestamp when TPSCheck usage resets."),
    }),
  }),
  defineProviderAction(service, {
    name: "check_phone",
    operationType: "read",
    description: "Check one UK phone number against TPS and CTPS and return the TPSCheck v2 response.",
    inputSchema: s.actionInput(
      {
        phone: nonEmptyString("UK phone number to check with TPSCheck."),
      },
      ["phone"],
      "Input payload for checking one UK phone number with TPSCheck v2.",
    ),
    outputSchema: singleCheckResultSchema,
  }),
  defineProviderAction(service, {
    name: "batch_check_phones",
    operationType: "read",
    description: "Check up to 100 UK phone numbers against TPS and CTPS and return the TPSCheck v2 batch response.",
    inputSchema: s.actionInput(
      {
        phones: s.array(
          "List of 1 to 100 UK phone numbers to check with TPSCheck.",
          nonEmptyString("One UK phone number to check with TPSCheck."),
          { minItems: 1, maxItems: 100 },
        ),
      },
      ["phones"],
      "Input payload for checking up to 100 UK phone numbers with TPSCheck v2.",
    ),
    outputSchema: s.looseRequiredObject("TPSCheck v2 batch response for multiple phone numbers.", {
      total: s.integer("Number of results returned by TPSCheck."),
      results: s.array("Batch TPSCheck v2 results for each submitted phone number.", singleCheckResultSchema),
    }),
  }),
];
