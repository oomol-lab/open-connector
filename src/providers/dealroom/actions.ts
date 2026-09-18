import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dealroom";

const keywordSchema = s.anyOf("A keyword or list of keywords to search for.", [
  s.nonEmptyString("A keyword to search for."),
  s.array("Keywords to search for. Arrays require keywordType default_next.", s.nonEmptyString("One keyword."), {
    minItems: 1,
  }),
]);

const filterValueSchema = s.anyOf("A documented Dealroom filter value.", [
  s.string("A date or other scalar string filter value."),
  s.integer("An integer range filter value."),
  s.array("A list of Dealroom term slugs.", s.string("One Dealroom term slug.")),
]);

const filterClauseSchema = s.record(
  "Dealroom filter names mapped to values from the corresponding filters endpoint.",
  filterValueSchema,
);

const formDataSchema = s.object(
  "Boolean filter clauses using fields advertised by the corresponding Dealroom filters endpoint.",
  {
    must: filterClauseSchema,
    should: filterClauseSchema,
    mustNot: filterClauseSchema,
  },
  { optional: ["must", "should", "mustNot"] },
);

const resultItemSchema = s.looseObject(
  "One Dealroom result. Its fields follow the requested fields projection and the public Dealroom schema.",
);

const searchOutputSchema = s.object("A paginated Dealroom search response.", {
  total: s.integer("The total number of matching Dealroom records."),
  items: s.array("The Dealroom records returned for this page.", resultItemSchema),
});

function searchInputSchema(sortValues: readonly string[], entityName: string) {
  return s.object(
    `Search parameters for Dealroom ${entityName}.`,
    {
      keyword: keywordSchema,
      keywordType: s.stringEnum("The documented Dealroom keyword field strategy.", [
        "default",
        "default_next",
        "name",
        "website_domain",
      ]),
      keywordMatchType: s.stringEnum("The documented Dealroom keyword matching strategy.", [
        "fuzzy",
        "exact",
        "all",
        "any",
      ]),
      formData: formDataSchema,
      fields: s.nonEmptyString(
        "Comma-separated response fields, including documented bracket notation for nested fields.",
      ),
      sort: s.stringEnum("A documented sort field. Prefix the value with a minus sign for descending order.", [
        ...sortValues,
        ...sortValues.map((value) => `-${value}`),
      ]),
      limit: s.integer("Number of results to return, from 1 through 100.", {
        minimum: 1,
        maximum: 100,
      }),
      offset: s.integer("Zero-based result offset.", { minimum: 0, maximum: 10_000 }),
    },
    {
      optional: ["keyword", "keywordType", "keywordMatchType", "formData", "fields", "sort", "limit", "offset"],
    },
  );
}

const companySortValues = [
  "name",
  "industries",
  "growth_stage",
  "locations",
  "total_funding",
  "tags",
  "traffic_summary",
  "last_funding_date",
  "last_updated",
  "last_updated_utc",
  "created_utc",
  "website_traffic_3_months_growth_rank",
  "website_traffic_6_months_growth_rank",
  "website_traffic_12_months_growth_rank",
  "website_traffic_3_months_growth_relative",
  "website_traffic_6_months_growth_relative",
  "website_traffic_12_months_growth_relative",
  "app_3_months_growth_rank",
  "app_6_months_growth_rank",
  "app_12_months_growth_rank",
  "app_3_months_growth_relative",
  "app_6_months_growth_relative",
  "app_12_months_growth_relative",
  "employee_3_months_growth_rank",
  "employee_6_months_growth_rank",
  "employee_12_months_growth_rank",
  "employee_3_months_growth_relative",
  "employee_6_months_growth_relative",
  "employee_12_months_growth_relative",
  "dealroom_signal",
  "growth_rate",
];

const investorSortValues = [
  "name",
  "investment_stages",
  "locations",
  "industry_experience",
  "client_focus",
  "tags",
  "total_funding",
  "recent_funding",
  "last_updated",
  "last_updated_utc",
  "created_utc",
];

const transactionSortValues = [
  "name",
  "date",
  "industries",
  "hq_locations",
  "growth_stages",
  "total_funding",
  "last_funding",
  "amount",
  "last_updated",
  "last_updated_utc",
  "created_utc",
];

export const dealroomActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_companies",
    operationType: "read",
    description:
      "Search Dealroom companies with documented keyword, boolean filter, projection, sorting, and pagination options.",
    requiredScopes: [],
    inputSchema: searchInputSchema(companySortValues, "companies"),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_investors",
    operationType: "read",
    description:
      "Search Dealroom investment institutions with documented keyword, boolean filter, projection, sorting, and pagination options.",
    requiredScopes: [],
    inputSchema: searchInputSchema(investorSortValues, "investors"),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_transactions",
    operationType: "read",
    description:
      "Search Dealroom transactions and return their documented funding and round data without inferring seller or exit-party roles.",
    requiredScopes: [],
    inputSchema: searchInputSchema(transactionSortValues, "transactions"),
    outputSchema: searchOutputSchema,
  }),
];
