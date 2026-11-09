import type { ActionDefinition } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const database = s.string("The Semrush regional database code, such as us.", { minLength: 1 });

const domain = s.string("The website domain without a scheme or path.", {
  minLength: 1,
  maxLength: 2048,
});

const reportOutput = s.object(
  "The parsed Semrush report returned by AIsa.",
  {
    rawText: s.string("The original semicolon-delimited response returned by AIsa."),
    columns: s.array("The report columns in response order.", s.string("A report column name.")),
    rows: s.array(
      "The report rows in response order.",
      s.array("One report row aligned with columns.", s.string("A raw Semrush field value.")),
    ),
  },
  { optional: [] },
);

const similarwebFields = {
  startMonth: s.string("The first reporting month in YYYY-MM format."),
  endMonth: s.string("The last reporting month in YYYY-MM format."),
  country: s.optional(s.stringEnum("Worldwide coverage; only ww is supported.", ["ww"])),
  webSource: s.optional(s.stringEnum("Device coverage; only total is supported.", ["total"])),
  mainDomainOnly: s.optional(s.boolean("Whether to exclude subdomains from the report.")),
};

const limit = s.integer("The maximum number of report records to return.", {
  minimum: 1,
  maximum: 20,
});

const similarwebOutput = s.looseObject(
  "The Similarweb research response. AIsa does not publish a fixed response structure for this endpoint.",
);

export const commercialResearchActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "get_semrush_domain_paid_keywords",
    operationType: "read",
    description:
      "Find a domain's paid-search keywords, positions, search volume, CPC, and landing pages. Returns up to 20 rows without pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "A domain and regional database for paid-search keyword research.",
      {
        domain,
        database,
      },
      { optional: [] },
    ),
    outputSchema: reportOutput,
  }),
  defineProviderAction("aisa", {
    name: "get_semrush_paid_results",
    operationType: "read",
    description:
      "Find advertisers and landing pages for a keyword in Semrush. Returns up to 20 rows without pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "A keyword and optional regional database for paid-search results.",
      {
        phrase: s.string("The keyword phrase to research.", { minLength: 1 }),
        database: s.optional(database),
      },
      { optional: [] },
    ),
    outputSchema: reportOutput,
  }),
  defineProviderAction("aisa", {
    name: "get_similarweb_conversion_rates",
    operationType: "read",
    description: "Research monthly estimated website conversion rates with Similarweb worldwide data.",
    requiredScopes: [],
    inputSchema: s.object(
      "A website and monthly period for conversion-rate research.",
      {
        domain,
        ...similarwebFields,
        limit,
      },
      { optional: [] },
    ),
    outputSchema: similarwebOutput,
  }),
  defineProviderAction("aisa", {
    name: "get_similarweb_conversion_rates_aggregated",
    operationType: "read",
    description: "Research aggregated estimated website conversion rates with Similarweb worldwide data.",
    requiredScopes: [],
    inputSchema: s.object(
      "A website and monthly period for aggregated conversion-rate research.",
      {
        domain,
        ...similarwebFields,
        limit,
      },
      { optional: [] },
    ),
    outputSchema: similarwebOutput,
  }),
  defineProviderAction("aisa", {
    name: "get_similarweb_keyword_overview",
    operationType: "read",
    description: "Compare up to 20 keywords using Similarweb worldwide monthly keyword research.",
    requiredScopes: [],
    inputSchema: s.object(
      "Keywords and monthly period for a Similarweb keyword overview.",
      {
        keywords: s.array("One to twenty keywords to research.", s.string("A keyword phrase.", { minLength: 1 }), {
          minItems: 1,
          maxItems: 20,
        }),
        ...similarwebFields,
        limit,
      },
      { optional: [] },
    ),
    outputSchema: similarwebOutput,
  }),
  defineProviderAction("aisa", {
    name: "get_similarweb_demographic_group",
    operationType: "read",
    description: "Research estimated website traffic for one age group using Similarweb worldwide data.",
    requiredScopes: [],
    inputSchema: s.object(
      "A website, age group, metrics, and reporting period.",
      {
        domain,
        ...similarwebFields,
        ageBucket: s.stringEnum("The lower age bound of one age group; 65 means ages 65 and older.", [
          "18",
          "25",
          "35",
          "45",
          "55",
          "65",
        ]),
        metrics: s.array(
          "One to eight Similarweb demographic metrics, such as share.",
          s.string("A demographic metric name.", { minLength: 1 }),
          {
            minItems: 1,
            maxItems: 8,
          },
        ),
      },
      { optional: [] },
    ),
    outputSchema: similarwebOutput,
  }),
];

const similarwebQuery = {
  startMonth: "start_date",
  endMonth: "end_date",
  country: "country",
  webSource: "web_source",
  mainDomainOnly: "main_domain_only",
};

const similarwebFixedQuery = { granularity: "monthly", format: "json" };

export const commercialResearchRoutes: Record<string, AisaActionRoute> = {
  get_semrush_domain_paid_keywords: {
    path: "/apis/v1/semrush/domain-paid-keywords",
    query: { domain: "domain", database: "database" },
    response: { type: "semicolon" as const, header: "required" as const },
  },
  get_semrush_paid_results: {
    path: "/apis/v1/semrush/keyword-paid-results",
    query: { phrase: "phrase", database: "database" },
    response: { type: "semicolon" as const, header: "required" as const },
  },
  get_similarweb_conversion_rates: {
    path: "/apis/v1/similarweb/website-analysis/websites/conversion-rates",
    query: { ...similarwebQuery, domain: "domain", limit: "limit" },
    fixedQuery: similarwebFixedQuery,
  },
  get_similarweb_conversion_rates_aggregated: {
    path: "/apis/v1/similarweb/website-analysis/websites/conversion-rates/aggregated",
    query: { ...similarwebQuery, domain: "domain", limit: "limit" },
    fixedQuery: similarwebFixedQuery,
  },
  get_similarweb_keyword_overview: {
    path: "/apis/v1/similarweb/keyword-analysis/keywords/overview",
    query: { ...similarwebQuery, keywords: "keywords", limit: "limit" },
    commaSeparated: ["keywords"],
    fixedQuery: similarwebFixedQuery,
  },
  get_similarweb_demographic_group: {
    path: "/apis/v1/similarweb/website-analysis/websites/traffic-by-demographics/aggregated",
    query: { ...similarwebQuery, domain: "domain", ageBucket: "age_bucket", metrics: "metrics" },
    commaSeparated: ["metrics"],
    fixedQuery: similarwebFixedQuery,
  },
};
