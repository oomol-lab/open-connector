import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "crustdata";

export const crustdataApiVersion = "2025-11-01";

const identifierArraySchema = (description: string, itemDescription: string) =>
  s.array(description, s.nonEmptyString(itemDescription), { minItems: 1 });
const companyIdArraySchema = s.array("The Crustdata company IDs to enrich.", s.integer("One Crustdata company ID."), {
  minItems: 1,
});
const fieldArraySchema = s.array(
  "The response fields or sections to request from Crustdata.",
  s.nonEmptyString("One field or section name accepted by the Crustdata API."),
  {
    minItems: 1,
  },
);
const filterValueSchema = s.anyOf("One supported Crustdata filter value.", [
  s.nonEmptyString("A string filter value."),
  s.integer("An integer filter value."),
  s.number("A numeric filter value."),
  s.boolean("A boolean filter value."),
  s.array(
    "An array filter value accepted by the Crustdata API.",
    s.anyOf("One array item for a Crustdata filter value.", [
      s.nonEmptyString("A string array item."),
      s.integer("An integer array item."),
      s.number("A numeric array item."),
      s.boolean("A boolean array item."),
    ]),
    { minItems: 1 },
  ),
]);
const filterOperatorSchema = s.stringEnum(
  "The official Crustdata filter operator. Use `=>` and `=<` instead of `>=` and `<=`.",
  ["=", "!=", ">", "<", "=>", "=<", "in", "not_in", "is_null", "is_not_null", "(.)", "[.]"],
);
const filterSchema = s.looseObject(
  {
    field: s.nonEmptyString("The searchable field name to filter on."),
    operator: filterOperatorSchema,
    value: filterValueSchema,
    and: s.array(
      "A list of nested filter conditions or groups combined with logical AND.",
      s.looseObject("One nested filter condition or group."),
      {
        minItems: 1,
      },
    ),
    or: s.array(
      "A list of nested filter conditions or groups combined with logical OR.",
      s.looseObject("One nested filter condition or group."),
      {
        minItems: 1,
      },
    ),
  },
  { description: "A Crustdata filter condition or nested group using `and` or `or` arrays." },
);
const sortSchema = s.object(
  {
    column: s.nonEmptyString("The sortable field name to order by."),
    order: s.stringEnum("The sort order for one Crustdata sort rule.", ["asc", "desc"]),
  },
  { required: ["column", "order"], description: "One Crustdata sort rule." },
);
const responseFieldValueSchema = s.anyOf("One primitive Crustdata response value.", [
  s.string("A string response value."),
  s.integer("An integer response value."),
  s.number("A numeric response value."),
  s.boolean("A boolean response value."),
  s.object({}, { description: "An empty object response value." }),
]);
const companyDataSchema = s.looseObject(
  {
    crustdata_company_id: s.integer("The Crustdata company ID when present."),
    basic_info: s.looseObject(
      {
        name: s.string("The company name returned by Crustdata."),
        primary_domain: s.string("The primary domain returned by Crustdata."),
      },
      { description: "The `basic_info` section returned by Crustdata." },
    ),
    metadata: s.record("Additional metadata returned by Crustdata.", responseFieldValueSchema),
  },
  { description: "The upstream Crustdata company payload." },
);
const companyMatchSchema = s.object(
  {
    confidenceScore: s.number("The Crustdata confidence score for this match."),
    companyData: companyDataSchema,
  },
  { required: ["confidenceScore", "companyData"], description: "One Crustdata company match." },
);
const companyResultSchema = s.object(
  {
    matchedOn: s.string("The identifier Crustdata matched on."),
    matchType: s.string("The identifier type Crustdata reports for this result."),
    matches: s.array("The ranked company matches returned by Crustdata.", companyMatchSchema),
  },
  {
    required: ["matchedOn", "matchType", "matches"],
    description: "One normalized Crustdata identify or enrich result.",
  },
);
const identifyLikeInputSchema = s.object(
  {
    domains: identifierArraySchema("The company domains to resolve or enrich.", "One company domain."),
    professionalNetworkProfileUrls: identifierArraySchema(
      "The company profile URLs to resolve or enrich.",
      "One company profile URL.",
    ),
    names: identifierArraySchema("The company names to resolve or enrich.", "One company name."),
    crustdataCompanyIds: companyIdArraySchema,
    fields: fieldArraySchema,
    exactMatch: s.boolean("Whether Crustdata should enforce strict domain matching."),
  },
  {
    optional: ["domains", "professionalNetworkProfileUrls", "names", "crustdataCompanyIds", "fields", "exactMatch"],
    description:
      "Input parameters for identifying or enriching companies with Crustdata. Provide exactly one identifier array.",
  },
);
const searchInputSchema = s.object(
  {
    filters: filterSchema,
    fields: fieldArraySchema,
    sorts: s.array("The ordered sort rules for a company search request.", sortSchema, { minItems: 1 }),
    limit: s.integer({ minimum: 1, maximum: 1000, description: "The number of companies to return per page." }),
    cursor: s.nonEmptyString("The pagination cursor returned by a previous search response."),
  },
  {
    optional: ["filters", "fields", "sorts", "limit", "cursor"],
    description: "Input parameters for searching companies with Crustdata.",
  },
);
const autocompleteInputSchema = s.object(
  {
    field: s.nonEmptyString("The searchable field to autocomplete."),
    query: s.string("The partial text to match. Use an empty string for common values."),
    limit: s.integer({ minimum: 1, maximum: 100, description: "The maximum number of suggestions to return." }),
    filters: filterSchema,
  },
  {
    required: ["field", "query"],
    optional: ["limit", "filters"],
    description: "Input parameters for requesting Crustdata company autocomplete suggestions.",
  },
);

export const crustdataActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "identify_companies",
    description:
      "Resolve companies from domains, profile URLs, names, or Crustdata company IDs and return ranked matches.",
    inputSchema: identifyLikeInputSchema,
    outputSchema: s.object(
      { results: s.array("The normalized identify results for each submitted identifier.", companyResultSchema) },
      { required: ["results"], description: "The normalized Crustdata identify response." },
    ),
  }),
  defineProviderAction(service, {
    name: "enrich_companies",
    description:
      "Enrich companies from one identifier family and optional field sections, returning ranked company matches with detailed profiles.",
    inputSchema: identifyLikeInputSchema,
    outputSchema: s.object(
      { results: s.array("The normalized enrich results for each submitted identifier.", companyResultSchema) },
      { required: ["results"], description: "The normalized Crustdata enrich response." },
    ),
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search companies with Crustdata filters, optional field selection, sorting, and cursor pagination.",
    inputSchema: searchInputSchema,
    outputSchema: s.object(
      {
        companies: s.array("The company search results returned by Crustdata.", companyDataSchema),
        nextCursor: s.nullableString(
          "The cursor for the next company search page, or null when no further page exists.",
        ),
        totalCount: s.nullableInteger("The total number of matching companies when Crustdata returns it."),
      },
      {
        required: ["companies", "nextCursor", "totalCount"],
        description: "The normalized Crustdata company search response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "autocomplete_companies",
    description: "Return exact field values to reuse in Crustdata company search filters.",
    inputSchema: autocompleteInputSchema,
    outputSchema: s.object(
      {
        suggestions: s.array(
          "The ordered autocomplete suggestions returned by Crustdata.",
          s.object(
            { value: s.string("The exact field value to reuse in a later search filter.") },
            { required: ["value"], description: "One autocomplete suggestion." },
          ),
        ),
      },
      { required: ["suggestions"], description: "The normalized Crustdata company autocomplete response." },
    ),
  }),
];
