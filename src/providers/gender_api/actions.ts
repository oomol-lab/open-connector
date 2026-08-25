import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gender_api";

const countrySchema = s.string({
  description: "The optional ISO 3166-1 alpha-2 country code used to localize the query.",
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Z]{2}$",
});
const localeSchema = s.string({
  description: "The optional browser locale used by Gender-API.com to localize the query.",
  minLength: 1,
  maxLength: 35,
});
const ipSchema = s.string({
  description: "The optional IPv4 or IPv6 address used by Gender-API.com to localize the query.",
  minLength: 1,
  maxLength: 45,
});
const requestIdSchema = s.anyOf("An optional caller-supplied ID echoed by Gender-API.com.", [
  s.string({
    description: "A caller-supplied string ID echoed by Gender-API.com.",
    minLength: 1,
    maxLength: 50,
  }),
  s.integer("A caller-supplied integer ID echoed by Gender-API.com."),
]);

const commonQueryProperties: Record<string, JsonSchema> = {
  country: countrySchema,
  locale: localeSchema,
  ip: ipSchema,
  id: requestIdSchema,
};
const commonQueryOptional = ["country", "locale", "ip", "id"];

const genderSchema = s.stringEnum("The inferred gender value returned by Gender-API.com.", [
  "male",
  "female",
  "unknown",
]);

const detailsSchema = s.looseObject("Technical details returned by Gender-API.com.", {
  credits_used: s.nonNegativeInteger("The number of credits consumed by this query."),
  samples: s.nonNegativeInteger("The number of records that matched the query."),
  country: s.nullableString("The country Gender-API.com found or applied to the query."),
  first_name_sanitized: s.string("The first name after Gender-API.com normalization."),
  full_name_sanitized: s.string("The full name after Gender-API.com normalization."),
  email_sanitized: s.string("The email address after Gender-API.com normalization."),
  duration: s.string("The server-side processing duration."),
});

const predictionOutputSchema = s.object(
  "A gender lookup response returned by Gender-API.com.",
  {
    input: s.looseObject("The submitted payload echoed by Gender-API.com."),
    details: detailsSchema,
    result_found: s.boolean("Whether Gender-API.com found a gender result for the input."),
    first_name: s.string("The first name Gender-API.com used for genderization."),
    last_name: s.string("The last name extracted by Gender-API.com when available."),
    full_name: s.string("The full name Gender-API.com used for genderization when available."),
    email: s.email("The email address Gender-API.com used for genderization when available."),
    probability: s.number("The probability score for the inferred gender.", { minimum: 0, maximum: 1 }),
    gender: genderSchema,
  },
  { optional: ["first_name", "last_name", "full_name", "email", "probability", "gender"] },
);

const originItemSchema = s.object(
  "One likely country of origin returned by Gender-API.com.",
  {
    country_name: s.string("The localized country name."),
    country: s.string({
      description: "The ISO 3166-1 alpha-2 country code.",
      minLength: 2,
      maxLength: 2,
    }),
    probability: s.number("The probability that the queried name originates from this country.", {
      minimum: 0,
      maximum: 1,
    }),
    continental_region: s.string("The continental region containing the country."),
    statistical_region: s.string("The statistical region containing the country."),
  },
  { optional: ["country_name", "country", "probability", "continental_region", "statistical_region"] },
);

const ethnicityDistributionItemSchema = s.object(
  "One ethnicity distribution entry returned by Gender-API.com.",
  {
    id: s.string("The ethnicity identifier."),
    name: s.string("The ethnicity name."),
    percentage: s.number("The percentage for this ethnicity distribution entry.", { minimum: 0, maximum: 100 }),
  },
  { optional: ["id", "name", "percentage"] },
);

const ethnicitySchema = s.looseObject("Ethnicity details returned by Gender-API.com.", {
  id: s.string("The primary ethnicity identifier."),
  name: s.string("The primary ethnicity name."),
  distribution: s.array(
    "The ethnicity distribution entries returned by Gender-API.com.",
    ethnicityDistributionItemSchema,
  ),
});

const countryOfOriginOutputSchema = s.object(
  "A country-of-origin response returned by Gender-API.com.",
  {
    input: s.looseObject("The submitted payload echoed by Gender-API.com."),
    details: detailsSchema,
    result_found: s.boolean("Whether Gender-API.com found origin metadata for the input."),
    country_of_origin: s.array("The likely countries of origin returned by Gender-API.com.", originItemSchema),
    country_of_origin_map_url: s.url("A Gender-API.com map URL for the returned country-of-origin distribution."),
    first_name: s.string("The first name Gender-API.com used for the analysis."),
    probability: s.number("The probability score for the inferred gender.", { minimum: 0, maximum: 1 }),
    gender: genderSchema,
    language_of_origin: s.string("The likely language of origin when returned."),
    meaning: s.string("The documented name meaning when returned."),
    ethnicity: ethnicitySchema,
  },
  {
    optional: [
      "country_of_origin",
      "country_of_origin_map_url",
      "first_name",
      "probability",
      "gender",
      "language_of_origin",
      "meaning",
      "ethnicity",
    ],
  },
);

const statisticDetailsSchema = s.object(
  "Technical details returned by the Gender-API.com statistics endpoint.",
  {
    credits_used: s.nonNegativeInteger("The number of credits consumed by this statistics query."),
    duration: s.string("The server-side processing duration."),
  },
  { optional: ["credits_used", "duration"] },
);

const usageLastMonthSchema = s.object(
  "Gender-API.com usage information for the previous month.",
  {
    date: s.string("The month represented by this usage entry."),
    credits_used: s.nonNegativeInteger("The credits consumed during the previous month."),
  },
  { optional: ["date", "credits_used"] },
);

const statisticsOutputSchema = s.object(
  "Account usage statistics returned by Gender-API.com.",
  {
    is_limit_reached: s.boolean("Whether the account has reached its current usage limit."),
    remaining_credits: s.nonNegativeInteger("The credits remaining on the account."),
    details: statisticDetailsSchema,
    usage_last_month: usageLastMonthSchema,
  },
  { optional: ["details", "usage_last_month"] },
);

const firstNameInputSchema = s.object(
  "Input for querying gender by first name.",
  {
    first_name: s.string({
      description: "The first name to classify with Gender-API.com.",
      minLength: 1,
      maxLength: 50,
    }),
    ...commonQueryProperties,
  },
  { optional: commonQueryOptional },
);

const fullNameInputSchema = s.object(
  "Input for querying gender by full name.",
  {
    full_name: s.string({
      description: "The full name to classify with Gender-API.com.",
      minLength: 3,
      maxLength: 100,
    }),
    ...commonQueryProperties,
  },
  { optional: commonQueryOptional },
);

const emailInputSchema = s.object(
  "Input for querying gender by email address.",
  {
    email: s.email("The email address to classify with Gender-API.com."),
    ...commonQueryProperties,
  },
  { optional: commonQueryOptional },
);

const countryOfOriginInputSchema = s.object(
  "Input for querying country-of-origin metadata.",
  {
    first_name: s.string({
      description: "The first name to analyze with Gender-API.com.",
      minLength: 1,
      maxLength: 50,
    }),
    full_name: s.string({
      description: "The full name to analyze with Gender-API.com.",
      minLength: 3,
      maxLength: 100,
    }),
    email: s.email("The email address to analyze with Gender-API.com."),
    id: requestIdSchema,
  },
  { optional: ["first_name", "full_name", "email", "id"] },
);
countryOfOriginInputSchema.oneOf = [{ required: ["first_name"] }, { required: ["full_name"] }, { required: ["email"] }];

export const genderApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_gender_by_first_name",
    description:
      "Determine the likely gender for one first name with optional country, locale, IP, and caller ID hints.",
    inputSchema: firstNameInputSchema,
    outputSchema: predictionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "query_gender_by_full_name",
    description: "Determine the likely gender for one full name while letting Gender-API.com split the name.",
    inputSchema: fullNameInputSchema,
    outputSchema: predictionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "query_gender_by_email_address",
    description: "Determine the likely gender for one email address after Gender-API.com extracts a name from it.",
    inputSchema: emailInputSchema,
    outputSchema: predictionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_country_of_origin",
    description: "Get likely country-of-origin and ethnicity metadata for one first name, full name, or email address.",
    inputSchema: countryOfOriginInputSchema,
    outputSchema: countryOfOriginOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_statistics",
    description: "Read remaining credits and recent usage statistics for the connected account.",
    inputSchema: s.object("Input for querying Gender-API.com account statistics.", {}),
    outputSchema: statisticsOutputSchema,
  }),
];
