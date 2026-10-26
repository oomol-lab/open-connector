import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const company = s.looseObject("A company record with its identity and returned enrichment sections.");
const listOutput = s.looseObject("The company research result returned by Akta.", {
  data: s.array("The matching company records.", company),
  count: s.integer("The number of returned companies."),
  total_count: s.integer("The total matching companies, capped at 500 by Akta."),
  credits_consumed: s.number("The Akta credits consumed by the request."),
});
export const aktaActions: readonly ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "search_akta_companies",
    operationType: "read",
    description: "Find Akta companies by name, website, or UUID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The company search query.",
      { query: s.string("A company name, website, or UUID.") },
      {
        optional: ["query"],
      },
    ),
    outputSchema: listOutput,
  }),
  defineProviderAction("aisa", {
    name: "enrich_akta_company",
    operationType: "read",
    description:
      "Retrieve Akta company profile sections, including firmographics, management, products, and financial estimates.",
    requiredScopes: [],
    inputSchema: s.object(
      "The company and enrichment sections to retrieve.",
      {
        company: s.string("The company identifier accepted by Akta."),
        sections: s.string("The Akta enrichment section selection, passed unchanged to the upstream query parameter."),
      },
      {
        optional: ["company", "sections"],
      },
    ),
    outputSchema: s.looseObject("The company enrichment returned by Akta.", {
      status: s.string("The upstream result status."),
      count: s.integer("The number of returned sections."),
      credits_consumed: s.number("The Akta credits consumed."),
      data: s.looseObject("Company data keyed by enrichment section."),
    }),
  }),
  defineProviderAction("aisa", {
    name: "search_akta_industries",
    operationType: "read",
    description: "Resolve industry terms to ranked Akta industry codes.",
    requiredScopes: [],
    inputSchema: s.object(
      "The industry query and taxonomy level.",
      {
        query: s.string("The industry search text."),
        level: s.string("The taxonomy level accepted by Akta."),
      },
      {
        optional: ["query", "level"],
      },
    ),
    outputSchema: s.looseObject("The matching industries returned by Akta.", {
      data: s.array("The ranked industry records.", s.looseObject("An industry code and its associated metadata.")),
      count: s.integer("The number of returned industries."),
      credits_consumed: s.number("The Akta credits consumed."),
    }),
  }),
  defineProviderAction("aisa", {
    name: "search_akta_company_list",
    operationType: "read",
    description:
      "Search an Akta company list using natural language or structured filters, with optional enrichment and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Company list filters, sorting, and enrichment options.",
      {
        query: s.string("A natural-language company search; cannot be combined with filters."),
        filters: s.looseObject(
          "Akta structured filters; cannot be combined with query. Use upstream filter field names.",
        ),
        sections: s.array(
          "Enrichment sections: firmographic, business_model, company_assessment, trust_signal, company_hierarchy, digital_presence, financial_estimate, location, management_profile, product_offering, strategic_signal, customer_profile, industry, technology, funding_detail, mna_and_investment. Funding and M&A may require a supplier subscription.",
          s.string("An Akta enrichment section name."),
        ),
        limit: s.integer("The maximum number of companies; upstream default 50, maximum 500.", {
          maximum: 500,
        }),
        offset: s.integer("The number of results to skip; upstream default zero."),
        sortBy: s.stringEnum("The result ordering field; upstream default relevance.", [
          "relevance",
          "revenue_estimate",
          "valuation_estimate",
          "employee_range",
          "total_funding",
          "founded_year",
        ]),
        sortOrder: s.stringEnum("The sort direction; upstream default desc.", ["asc", "desc"]),
      },
      {
        optional: ["query", "filters", "sections", "limit", "offset", "sortBy", "sortOrder"],
        not: { required: ["query", "filters"] },
      },
    ),
    outputSchema: listOutput,
  }),
];
