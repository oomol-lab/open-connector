import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "autom";

const finderInputSchema = s.actionInput(
  {
    query: s.nonEmptyString("Search text used to filter Autom finder results."),
  },
  ["query"],
  "Input parameters for an Autom finder lookup.",
);

const periodSchema = s.actionOutput(
  {
    start: s.string("The start date of the current billing period."),
    end: s.string("The end date of the current billing period."),
  },
  "The current Autom billing period.",
);

const subscriptionSchema = s.actionOutput(
  {
    used: s.integer("The number of subscription calls used in the current billing period."),
    total: s.integer("The subscription call quota for the current billing period."),
    remaining: s.integer("The number of subscription calls remaining."),
    percent_used: s.number("The percentage of subscription quota consumed."),
  },
  "Autom subscription quota usage.",
);

const creditsSchema = s.looseRequiredObject(
  "Autom extra credit usage.",
  {
    given: s.integer("The number of extra credits added to the account."),
    consumed: s.integer("The number of extra credits consumed."),
    remaining: s.integer("The number of extra credits remaining."),
    percent_used: s.number("The percentage of extra credits consumed when returned."),
  },
  { optional: ["percent_used"] },
);

const rateLimitSchema = s.actionOutput(
  {
    per_minute: s.nullableInteger("The requests-per-minute limit, or null when unlimited."),
    per_second: s.nullableInteger("The requests-per-second limit, or null when unlimited."),
  },
  "Autom account rate limits.",
);

const accountSchema = s.actionOutput(
  {
    name: s.string("The Autom account name."),
    slug: s.string("The Autom account slug."),
  },
  "Autom account metadata.",
);

const quotaSchema = s.nullableInteger("The configured per-key quota, or null when unlimited.");

const apiKeySchema = s.actionOutput(
  {
    alias: s.string("The friendly API key alias."),
    active: s.boolean("Whether the API key is active."),
    category: s.string("The API key category."),
    expires: s.nullableString("The API key expiry date, or null when it never expires."),
    quotas: s.looseObject(
      {
        total: quotaSchema,
        daily: quotaSchema,
        weekly: quotaSchema,
        monthly: quotaSchema,
      },
      { description: "Custom per-key quotas." },
    ),
  },
  "Autom API key metadata.",
);

const usageOutputSchema = s.actionOutput(
  {
    remaining: s.integer("Credits available right now."),
    total_used: s.integer("Credits consumed in the current billing period."),
    renewal_date: s.string("The ISO 8601 date when the subscription renews."),
    period: periodSchema,
    subscription: subscriptionSchema,
    credits: creditsSchema,
    rate_limit: rateLimitSchema,
    account: accountSchema,
    api_key: apiKeySchema,
  },
  "Autom usage, account, and API key details.",
);

const googleCountrySchema = s.actionOutput(
  {
    country_code: s.string("The Google country code."),
    country_name: s.string("The Google country name."),
  },
  "One Google country supported by Autom.",
);

const googleLanguageSchema = s.actionOutput(
  {
    language_code: s.string("The Google language code."),
    language_name: s.string("The Google language name."),
  },
  "One Google language supported by Autom.",
);

const googleLocationSchema = s.actionOutput(
  {
    id: s.string("The Autom location identifier."),
    gps: s.array("The location GPS coordinates as latitude and longitude.", s.number("One GPS coordinate.")),
    name: s.string("The location name."),
    reach: s.integer("The estimated Google reach for the location."),
    google_id: s.integer("The Google location identifier."),
    target_type: s.string("The Google target type."),
    country_code: s.string("The Google country code for the location."),
    canonical_name: s.string("The canonical Google location name."),
  },
  "One Google location supported by Autom.",
);

export const automActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_usage",
    operationType: "read",
    description:
      "Get current Autom credit usage, subscription quota, rate limits, account metadata, and API key metadata.",
    inputSchema: s.actionInput({}, [], "Input parameters for getting Autom usage."),
    outputSchema: usageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "find_google_countries",
    operationType: "read",
    description: "Search supported Google countries in Autom and return matching country codes.",
    inputSchema: finderInputSchema,
    outputSchema: s.actionOutput(
      {
        countries: s.array("The matching Google countries.", googleCountrySchema),
      },
      "Matching Google countries returned by Autom.",
    ),
  }),
  defineProviderAction(service, {
    name: "find_google_languages",
    operationType: "read",
    description: "Search supported Google languages in Autom and return matching language codes.",
    inputSchema: finderInputSchema,
    outputSchema: s.actionOutput(
      {
        languages: s.array("The matching Google languages.", googleLanguageSchema),
      },
      "Matching Google languages returned by Autom.",
    ),
  }),
  defineProviderAction(service, {
    name: "find_google_locations",
    operationType: "read",
    description: "Search supported Google locations in Autom and return matching location IDs.",
    inputSchema: finderInputSchema,
    outputSchema: s.actionOutput(
      {
        locations: s.array("The matching Google locations.", googleLocationSchema),
      },
      "Matching Google locations returned by Autom.",
    ),
  }),
];
