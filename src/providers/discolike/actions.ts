import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "discolike";

const domainSchema = s.nonEmptyString("The company domain to query, without protocol.");
const stringArraySchema = (description: string, itemDescription: string, maxItems = 20): JsonSchema =>
  s.array(description, s.nonEmptyString(itemDescription), { minItems: 1, maxItems });
const businessModelSchema = s.stringEnum("A DiscoLike business model filter value.", [
  "B2B",
  "B2C",
  "B2G",
  "G2B",
  "G2C",
  "D2C",
  "C2C",
  "C2B",
]);
const countriesSchema = stringArraySchema(
  "ISO 3166-1 alpha-2 country codes used to filter companies.",
  "One ISO 3166-1 alpha-2 country code.",
);
const categoriesSchema = stringArraySchema(
  "DiscoLike industry category values used to filter companies.",
  "One DiscoLike industry category value.",
);
const businessModelsSchema = s.array("Business model labels used to filter companies.", businessModelSchema, {
  minItems: 1,
  maxItems: 8,
});
const digitalFootprintSchema = s.integer("Digital footprint score from 0 to 800.", {
  minimum: 0,
  maximum: 800,
});

const filterProperties = {
  countries: countriesSchema,
  categories: categoriesSchema,
  businessModels: businessModelsSchema,
  employeeRange: s.nonEmptyString("Employee count range in DiscoLike min,max format, for example 51,200."),
  revenueRange: s.nonEmptyString(
    "Revenue range in DiscoLike min,max format using raw numbers, for example 1000000,10000000.",
  ),
  minDigitalFootprint: digitalFootprintSchema,
  maxDigitalFootprint: digitalFootprintSchema,
  excludeLeadgen: s.boolean("Whether to exclude suspected lead generation sites."),
};
const filterKeys = Object.keys(filterProperties);

const countInputSchema = s.object(
  "Filters for estimating how many company domains match a DiscoLike query.",
  filterProperties,
  {
    optional: filterKeys,
  },
);
const discoverInputBaseSchema = s.object(
  "Search parameters for discovering similar companies in DiscoLike.",
  {
    icpPrompt: s.string({
      description: "Natural language ICP description that DiscoLike converts into discovery filters.",
      minLength: 1,
      maxLength: 4000,
    }),
    domains: s.array("Seed company domains used for DiscoLike lookalike discovery.", domainSchema, {
      minItems: 1,
      maxItems: 10,
    }),
    maxRecords: s.integer("Maximum number of discovery results to return.", {
      minimum: 5,
      maximum: 10000,
    }),
    offset: s.integer("Number of discovery results to skip for pagination.", { minimum: 0 }),
    ...filterProperties,
  },
  {
    optional: ["icpPrompt", "domains", "maxRecords", "offset", ...filterKeys],
  },
);
const discoverInputSchema: JsonSchema = {
  ...discoverInputBaseSchema,
  anyOf: [
    { required: ["icpPrompt"] },
    { required: ["domains"] },
    { required: ["countries"] },
    { required: ["categories"] },
    { required: ["businessModels"] },
    { required: ["employeeRange"] },
    { required: ["revenueRange"] },
    { required: ["minDigitalFootprint"] },
    { required: ["maxDigitalFootprint"] },
  ],
};
const domainInputSchema = s.object("A single company domain query.", {
  domain: domainSchema,
});
const emptyInputSchema = s.object("The input payload for a DiscoLike account-level request.", {});

const companySchema = s.looseObject("A DiscoLike company profile.", {
  domain: s.string("Company domain and unique record identifier."),
  name: s.nullable(s.string("Latest and most accurate company name.")),
  score: s.nullable(s.integer("Company size and buying power score.")),
  industry_groups: s.record(
    "Industry group confidence values keyed by DiscoLike industry label.",
    s.number("The confidence score for one industry group."),
  ),
  business_model: s.record(
    "Business model confidence values keyed by DiscoLike business model label.",
    s.number("The confidence score for one business model."),
  ),
});
const scoreSchema = s.looseObject("A DiscoLike digital footprint score response.", {
  domain: s.string("Normalized domain name returned by DiscoLike."),
  score: s.integer("Final digital footprint score."),
});
const growthSchema = s.looseObject("A DiscoLike growth metrics response.", {
  domain: s.string("Normalized domain name returned by DiscoLike."),
  score_growth_3m: s.nullable(s.number("Three-month score growth rate.")),
  subdomain_growth_3m: s.nullable(s.number("Three-month subdomain growth rate.")),
});
const metricsSchema = s.looseObject("A DiscoLike certificate metrics response.", {
  domain: s.string("Normalized domain name returned by DiscoLike."),
  lookback_all: s.integer("Total registration events from the earliest known date."),
  lookback_360: s.integer("Total registration events in the last 360 days."),
  lookback_720: s.integer("Total registration events in the last 720 days."),
});
const usageSchema = s.looseObject("A DiscoLike API usage response.", {
  account_status: s.string("DiscoLike account status."),
  month_to_date_requests: s.integer("Total requests for the current month."),
  month_to_date_records: s.integer("Total records returned for the current month."),
  month_to_date_spend: s.number("Total spend for the current month."),
});

export type DiscolikeActionName =
  | "discover_companies"
  | "count_matching_domains"
  | "get_business_profile"
  | "get_digital_footprint_score"
  | "get_growth_metrics"
  | "get_certificate_metrics"
  | "get_usage";

export const discolikeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "discover_companies",
    description:
      "Discover companies in DiscoLike from a natural-language ICP prompt, seed domains, or company filters.",
    inputSchema: discoverInputSchema,
    outputSchema: s.object("The DiscoLike discovery results.", {
      results: s.array("The company profiles returned by DiscoLike.", companySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "count_matching_domains",
    description: "Estimate how many DiscoLike company domains match the provided filters.",
    inputSchema: countInputSchema,
    outputSchema: s.object("The DiscoLike count response.", {
      count: s.integer("Number of company domains matching the query."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_business_profile",
    description: "Get DiscoLike firmographic data for a single company domain.",
    inputSchema: domainInputSchema,
    outputSchema: s.object("The DiscoLike business profile response.", {
      company: companySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_digital_footprint_score",
    description: "Get DiscoLike digital footprint score details for a company domain.",
    inputSchema: domainInputSchema,
    outputSchema: s.object("The DiscoLike digital footprint score response.", {
      score: scoreSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_growth_metrics",
    description: "Get DiscoLike quarterly growth metrics for a company domain.",
    inputSchema: domainInputSchema,
    outputSchema: s.object("The DiscoLike growth metrics response.", {
      growth: growthSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_certificate_metrics",
    description: "Get DiscoLike SSL certificate registration metrics for a company domain.",
    inputSchema: domainInputSchema,
    outputSchema: s.object("The DiscoLike certificate metrics response.", {
      metrics: metricsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_usage",
    description: "Get DiscoLike API usage and billing counters for the current key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The DiscoLike usage response.", {
      usage: usageSchema,
    }),
  }),
];
