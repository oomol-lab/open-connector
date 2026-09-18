import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dataforb2b";
const filterOperators = ["=", ">", ">=", "<", "<=", "between", "in", "like"];

const jsonValueSchema = s.unknown("A JSON value used by a DataForB2B filter condition.");
const filterConditionSchema = s.object(
  "One DataForB2B filter condition or nested filter group.",
  {
    column: s.string("DataForB2B column name to filter on."),
    type: s.stringEnum("Comparison operator for this condition.", filterOperators),
    value: jsonValueSchema,
    value2: s.unknown("Second filter value used by the between operator."),
    op: s.stringEnum("Logical operator for a nested filter group.", ["and", "or"]),
    conditions: s.array(
      "Conditions contained in a nested filter group.",
      s.looseObject("A nested DataForB2B filter condition or group."),
    ),
  },
  { optional: ["column", "type", "value", "value2", "op", "conditions"] },
);
const filterGroupSchema = s.requiredObject("Filters used to select DataForB2B records.", {
  op: s.stringEnum("Logical operator used to combine filter conditions.", ["and", "or"]),
  conditions: s.array("Filter conditions or nested groups.", filterConditionSchema, {
    minItems: 1,
  }),
});
const paginationProperties = {
  offset: s.integer("Number of matching records to skip.", { minimum: 0 }),
  count: s.integer("Maximum number of records to return.", { minimum: 1, maximum: 1000 }),
  enrich_live: s.boolean("Whether to retrieve live enriched data at the higher credit cost."),
};
const searchOutputSchema = s.looseRequiredObject(
  "A paginated DataForB2B search result.",
  {
    total: s.integer("Total number of matching records."),
    offset: s.integer("Offset returned for this page."),
    count: s.integer("Number of records requested or returned."),
    results: s.array("Matching records returned by DataForB2B.", s.looseObject("One matching record.")),
  },
  { optional: [] },
);
const enrichmentOutputSchema = s.looseObject("Enrichment data and credit usage returned by DataForB2B.");
const enrichProfileInputSchema = {
  ...s.object(
    "Input for enriching a DataForB2B profile.",
    {
      profile_identifier: s.nonWhitespaceString("LinkedIn or X URL, public handle, or encoded DataForB2B profile ID."),
      enrich_profile: s.boolean("Whether to retrieve full profile information."),
      enrich_work_email: s.boolean("Whether to retrieve a professional email address."),
      enrich_personal_email: s.boolean("Whether to retrieve a personal email address."),
      enrich_phone: s.boolean("Whether to retrieve a phone number."),
      enrich_github: s.boolean("Whether to retrieve linked GitHub profile data."),
    },
    {
      optional: ["enrich_profile", "enrich_work_email", "enrich_personal_email", "enrich_phone", "enrich_github"],
    },
  ),
  anyOf: ["enrich_profile", "enrich_work_email", "enrich_personal_email", "enrich_phone", "enrich_github"].map(
    (name) => ({ required: [name], properties: { [name]: { const: true } } }),
  ),
};

export const dataForB2BActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Get the connected DataForB2B account status and remaining credit balance.",
    inputSchema: s.requiredObject("Input for retrieving DataForB2B account information.", {}),
    outputSchema: s.requiredObject("DataForB2B account information.", {
      valid: s.boolean("Whether the connected API key is valid."),
      credits: s.number("Remaining credits on the account."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_people",
    operationType: "read",
    description: "Search professional profiles with DataForB2B filters and pagination.",
    inputSchema: s.object(
      "Input for searching DataForB2B people.",
      { filters: filterGroupSchema, ...paginationProperties },
      { optional: ["filters", "offset", "count", "enrich_live"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_companies",
    operationType: "read",
    description: "Search companies with DataForB2B filters and pagination.",
    inputSchema: s.object(
      "Input for searching DataForB2B companies.",
      { filters: filterGroupSchema, ...paginationProperties },
      { optional: ["filters", "offset", "count", "enrich_live"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "count_results",
    operationType: "read",
    description: "Count matching people or companies without retrieving result records.",
    inputSchema: s.requiredObject("Input for counting DataForB2B search matches.", {
      category: s.stringEnum("Record category to count.", ["people", "company"]),
      filters: filterGroupSchema,
    }),
    outputSchema: s.requiredObject("DataForB2B search count result.", {
      total_results: s.integer("Number of matching records, capped at 10,000."),
      total_results_is_capped: s.boolean("Whether the real count exceeds the returned cap."),
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_profile",
    operationType: "read",
    description: "Enrich a person profile and optionally retrieve contact or GitHub data.",
    inputSchema: enrichProfileInputSchema,
    outputSchema: enrichmentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_company",
    operationType: "read",
    description: "Enrich a company with firmographic, funding, location, and growth data.",
    inputSchema: s.requiredObject("Input for enriching a DataForB2B company.", {
      company_identifier: s.nonWhitespaceString(
        "Company slug, LinkedIn or X URL, handle, or encoded DataForB2B company ID.",
      ),
    }),
    outputSchema: enrichmentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "typeahead",
    operationType: "read",
    description: "Autocomplete values for DataForB2B people and company search filters.",
    inputSchema: s.object(
      "Input for DataForB2B typeahead.",
      {
        type: s.stringEnum("Category of filter values to autocomplete.", [
          "company",
          "people_industry",
          "company_industry",
          "category",
          "location",
          "city",
          "region",
          "school",
          "title",
          "skill",
          "investor",
        ]),
        q: s.nonEmptyString("Search query for matching filter values.", { maxLength: 100 }),
        limit: s.integer("Maximum number of results to return.", { minimum: 1, maximum: 20 }),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.looseRequiredObject(
      "DataForB2B typeahead result.",
      {
        type: s.string("Typeahead category returned by DataForB2B."),
        count: s.integer("Number of autocomplete results returned."),
        credits_used: s.number("Credits charged for the request."),
        results: s.array(
          "Matching filter values.",
          s.looseObject("One typeahead result, including its value and optional metadata."),
        ),
      },
      { optional: [] },
    ),
  }),
];
