import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "spyfu" as const;

const countryCodes = [
  "AR",
  "AT",
  "AU",
  "BE",
  "BR",
  "CA",
  "CH",
  "DE",
  "DK",
  "ES",
  "FR",
  "IE",
  "IN",
  "IT",
  "JP",
  "MX",
  "NL",
  "NO",
  "NZ",
  "PL",
  "PT",
  "SE",
  "SG",
  "TR",
  "UA",
  "UK",
  "US",
  "ZA",
] as const;

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const countryCodeSchema = s.stringEnum("SpyFu country market whose Google data should be queried.", countryCodes);

const pageSizeSchema = s.integer("Maximum number of SpyFu rows to return.", {
  minimum: 1,
  maximum: 1_000,
});

const startingRowSchema = s.integer("One-based row offset used for SpyFu pagination.", {
  minimum: 1,
  maximum: 10_000,
});

const sortOrderSchema = s.stringEnum("Direction used to sort SpyFu results.", ["Ascending", "Descending"]);

const termsSchema = (description: string) =>
  s.stringArray(description, {
    minItems: 1,
    maxItems: 50,
    itemDescription: "One non-empty term.",
  });

const domainsSchema = (description: string) =>
  s.stringArray(description, {
    minItems: 1,
    maxItems: 10,
    itemDescription: "One domain included in the comparison.",
  });

const resultRowSchema = s.looseObject("One result row returned by SpyFu.");

const resultsOutputSchema = (description: string, extraProperties = {}) =>
  s.object(
    description,
    {
      ...extraProperties,
      resultCount: s.integer("Number of rows returned in this SpyFu response.", { minimum: 0 }),
      totalMatchingResults: s.integer("Total number of upstream rows matching the query when SpyFu reports it.", {
        minimum: 0,
      }),
      results: s.array("Result rows returned by SpyFu.", resultRowSchema),
    },
    { optional: ["totalMatchingResults"] },
  );

const sharedKeywordQueryProperties = {
  countryCode: countryCodeSchema,
  includeTerms: termsSchema("Terms that must be present in returned keywords."),
  includeAnyTerm: s.boolean("Whether a keyword may match any include term instead of requiring every include term."),
  excludeTerms: termsSchema("Terms that must not be present in returned keywords."),
  pageSize: pageSizeSchema,
  startingRow: startingRowSchema,
  sortOrder: sortOrderSchema,
  adultFilter: s.boolean("Whether SpyFu should exclude adult keywords."),
  onlyAdultKeywords: s.boolean("Whether SpyFu should return only adult keywords."),
} as const;

const sharedKeywordOptionalFields = [
  "countryCode",
  "includeTerms",
  "includeAnyTerm",
  "excludeTerms",
  "pageSize",
  "startingRow",
  "sortOrder",
  "adultFilter",
  "onlyAdultKeywords",
] as const;

export const spyfuActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_monthly_usage",
    description: "Retrieve SpyFu API usage and cost totals for one calendar month.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving monthly SpyFu API usage.",
      {
        usageMonth: s.string("Calendar month in YYYY-MM format.", {
          minLength: 7,
          maxLength: 7,
        }),
      },
      { optional: ["usageMonth"] },
    ),
    outputSchema: s.object("Monthly SpyFu API usage entries.", {
      usageMonth: s.string("Calendar month requested from SpyFu in YYYY-MM format."),
      usage: s.array(
        "Usage and cost entries returned by SpyFu.",
        s.looseObject("One monthly SpyFu API usage and cost entry."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_usage_breakdown",
    description: "Retrieve SpyFu API usage broken down by day or API method for one month.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving a SpyFu usage breakdown.",
      {
        usageMonth: s.string("Calendar month in YYYY-MM format.", {
          minLength: 7,
          maxLength: 7,
        }),
        breakdownType: s.stringEnum("Dimension used to break down monthly SpyFu API usage.", ["daily", "method"]),
      },
      { optional: ["usageMonth"] },
    ),
    outputSchema: s.object("SpyFu API usage breakdown entries.", {
      usageMonth: s.string("Calendar month requested from SpyFu in YYYY-MM format."),
      breakdownType: s.string("Dimension used for this usage breakdown."),
      usage: s.array(
        "Daily or per-method usage entries returned by SpyFu.",
        s.looseObject("One SpyFu API usage breakdown entry."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_latest_domain_stats",
    description: "Retrieve the latest SEO and PPC statistics for a domain.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving current SpyFu domain statistics.",
      {
        domain: nonEmptyString("Domain to analyze without requiring a protocol."),
        countryCode: countryCodeSchema,
        pastNMonths: s.integer("Number of recent months of domain statistics to return.", {
          minimum: 0,
          maximum: 120,
        }),
      },
      { optional: ["countryCode", "pastNMonths"] },
    ),
    outputSchema: resultsOutputSchema("Latest domain statistics returned by SpyFu.", {
      domain: s.string("Domain reported by SpyFu for these statistics."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_bulk_domain_stats",
    description: "Retrieve current or historical SEO and PPC statistics for multiple domains.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for bulk SpyFu domain statistics.",
      {
        domains: s.stringArray("Root domains to analyze: up to 100 latest snapshots or 10 complete histories.", {
          minItems: 1,
          maxItems: 100,
          itemDescription: "One root domain without a protocol or path.",
        }),
        showOnlyLatest: s.boolean("Whether SpyFu should return only the latest snapshot instead of complete history."),
        countryCode: countryCodeSchema,
      },
      { optional: ["countryCode"] },
    ),
    outputSchema: resultsOutputSchema("Bulk domain statistics returned by SpyFu."),
  }),
  defineProviderAction(service, {
    name: "find_matching_domains",
    description:
      "Discover domains matching a wildcard pattern and optional traffic, budget, rank, or strength criteria.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for discovering matching domains with SpyFu.",
      {
        query: nonEmptyString("Wildcard domain pattern such as *blog* or *software*."),
        countryCode: countryCodeSchema,
        sortBy: s.stringEnum("Domain statistic used to sort matching results.", [
          "AverageAdRank",
          "AverageOrganicRank",
          "MonthlyBudget",
          "MonthlyOrganicClicks",
          "MonthlyOrganicValue",
          "MonthlyPaidClicks",
          "Strength",
          "TotalOrganicResults",
        ]),
        sortOrder: sortOrderSchema,
        minMonthlyBudget: s.number("Minimum estimated monthly advertising budget.", {
          minimum: 0,
        }),
        maxMonthlyBudget: s.number("Maximum estimated monthly advertising budget.", {
          minimum: 0,
        }),
        minMonthlyOrganicClicks: s.number("Minimum estimated monthly organic clicks.", {
          minimum: 0,
        }),
        maxMonthlyOrganicClicks: s.number("Maximum estimated monthly organic clicks.", {
          minimum: 0,
        }),
        minMonthlyOrganicValue: s.number("Minimum estimated monthly organic traffic value.", {
          minimum: 0,
        }),
        maxMonthlyOrganicValue: s.number("Maximum estimated monthly organic traffic value.", {
          minimum: 0,
        }),
        minMonthlyPaidClicks: s.number("Minimum estimated monthly paid clicks.", {
          minimum: 0,
        }),
        maxMonthlyPaidClicks: s.number("Maximum estimated monthly paid clicks.", {
          minimum: 0,
        }),
        minTotalOrganicResults: s.number("Minimum number of ranking organic keywords.", {
          minimum: 0,
        }),
        maxTotalOrganicResults: s.number("Maximum number of ranking organic keywords.", {
          minimum: 0,
        }),
        minStrength: s.number("Minimum SpyFu domain strength score.", {
          minimum: 0,
          maximum: 100,
        }),
        maxStrength: s.number("Maximum SpyFu domain strength score.", {
          minimum: 0,
          maximum: 100,
        }),
        minAverageOrganicRank: s.number("Minimum average organic rank value.", {
          minimum: 1,
        }),
        maxAverageOrganicRank: s.number("Maximum average organic rank value.", {
          minimum: 1,
        }),
        minAverageAdRank: s.number("Minimum average paid ad rank value.", { minimum: 1 }),
        maxAverageAdRank: s.number("Maximum average paid ad rank value.", { minimum: 1 }),
        pageSize: pageSizeSchema,
        startingRow: startingRowSchema,
      },
      {
        optional: [
          "countryCode",
          "sortBy",
          "sortOrder",
          "minMonthlyBudget",
          "maxMonthlyBudget",
          "minMonthlyOrganicClicks",
          "maxMonthlyOrganicClicks",
          "minMonthlyOrganicValue",
          "maxMonthlyOrganicValue",
          "minMonthlyPaidClicks",
          "maxMonthlyPaidClicks",
          "minTotalOrganicResults",
          "maxTotalOrganicResults",
          "minStrength",
          "maxStrength",
          "minAverageOrganicRank",
          "maxAverageOrganicRank",
          "minAverageAdRank",
          "maxAverageAdRank",
          "pageSize",
          "startingRow",
        ],
      },
    ),
    outputSchema: resultsOutputSchema("Matching domains returned by SpyFu."),
  }),
  defineProviderAction(service, {
    name: "get_seo_keywords",
    description: "Retrieve SEO keywords for a domain by value, ranking change, click change, or page-one movement.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for SpyFu SEO keyword research.",
      {
        query: nonEmptyString("Domain, URL, subdomain, path, or page to analyze."),
        searchType: s.stringEnum("SEO keyword analysis performed by SpyFu.", [
          "GainedClicks",
          "GainedRanks",
          "JustFellOff",
          "JustMadeIt",
          "LostClicks",
          "LostRanks",
          "MostValuable",
          "NewlyRanked",
        ]),
        compareDomain: nonEmptyString("Optional domain used for competitive comparison fields."),
        excludeHomepageKeywords: s.boolean("Whether keywords where the target homepage ranks should be excluded."),
        exactMatch: s.boolean("Whether SpyFu should require an exact protocol, host, path, and trailing-slash match."),
        ...sharedKeywordQueryProperties,
      },
      {
        optional: ["compareDomain", "excludeHomepageKeywords", "exactMatch", ...sharedKeywordOptionalFields],
      },
    ),
    outputSchema: resultsOutputSchema("SEO keyword rows returned by SpyFu.", {
      searchType: s.string("SEO analysis mode used for this response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_top_pages",
    description: "Retrieve a domain's highest-traffic or newly successful organic pages and their top keywords.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving SpyFu top-performing pages.",
      {
        query: nonEmptyString("Domain, URL, subdomain, or path whose pages should be analyzed."),
        searchType: s.stringEnum("Page performance analysis performed by SpyFu.", ["MostTraffic", "New"]),
        keywordFilter: nonEmptyString("Keyword text used to restrict pages to a topic or content theme."),
        minSeoClicks: s.number("Minimum estimated monthly organic clicks for a page.", {
          minimum: 0,
        }),
        maxSeoClicks: s.number("Maximum estimated monthly organic clicks for a page.", {
          minimum: 0,
        }),
        countryCode: countryCodeSchema,
        pageSize: s.integer("Maximum number of top-page rows to return.", {
          minimum: 1,
          maximum: 100,
        }),
        startingRow: startingRowSchema,
        sortOrder: sortOrderSchema,
      },
      {
        optional: [
          "keywordFilter",
          "minSeoClicks",
          "maxSeoClicks",
          "countryCode",
          "pageSize",
          "startingRow",
          "sortOrder",
        ],
      },
    ),
    outputSchema: resultsOutputSchema("Top-performing page rows returned by SpyFu.", {
      searchType: s.string("Page analysis mode used for this response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_serp_analysis",
    description:
      "Analyze the current organic search result landscape for a keyword, including ranks and competing pages.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for analyzing a keyword SERP with SpyFu.",
      {
        keyword: nonEmptyString("Keyword whose organic search results should be analyzed."),
        countryCode: countryCodeSchema,
        pageSize: s.integer("Maximum number of SERP ranking rows to return.", {
          minimum: 1,
          maximum: 105,
        }),
      },
      { optional: ["countryCode", "pageSize"] },
    ),
    outputSchema: resultsOutputSchema("SERP ranking rows returned by SpyFu."),
  }),
  defineProviderAction(service, {
    name: "get_live_seo_stats",
    description:
      "Retrieve live aggregate organic visibility, click, value, and search-volume metrics for a domain or URL.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving live SpyFu SEO statistics.",
      {
        query: nonEmptyString("Domain, URL, subdomain, path, or page to analyze."),
        countryCode: countryCodeSchema,
      },
      { optional: ["countryCode"] },
    ),
    outputSchema: s.object(
      "Live aggregate SEO statistics returned by SpyFu.",
      {
        resultCount: s.integer("Number of aggregate results reported by SpyFu.", { minimum: 0 }),
        domain: s.nullableString("Root domain reported for the analyzed target."),
        url: s.nullableString("Normalized URL reported for the analyzed target."),
        totalOrganicResults: s.integer("Total ranking organic keywords found for the target.", {
          minimum: 0,
        }),
        monthlyOrganicClicks: s.number("Estimated monthly organic clicks for the target.", {
          minimum: 0,
        }),
        monthlyOrganicClickValue: s.number("Estimated monthly advertising value of the target's organic clicks.", {
          minimum: 0,
        }),
        totalSearchVolume: s.number("Combined monthly search volume across the target's ranking keywords.", {
          minimum: 0,
        }),
      },
      {
        optional: [
          "domain",
          "url",
          "totalOrganicResults",
          "monthlyOrganicClicks",
          "monthlyOrganicClickValue",
          "totalSearchVolume",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_domain_ranking_history",
    description: "Retrieve historical keyword ranks and aggregate click changes for a domain across a month range.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving SpyFu domain ranking history.",
      {
        domain: nonEmptyString("Domain whose historical organic rankings should be analyzed."),
        queryType: s.stringEnum("Historical ranking analysis performed by SpyFu.", [
          "MostValuable",
          "FellFromTop10",
          "MadeTheTop10",
          "NewKeywords",
          "NoLongerRanks",
          "GainedRanks",
          "LostRanks",
          "GainedClicks",
          "LostClicks",
        ]),
        startMonth: s.string("Beginning month of the ranking range in YYYY-MM format.", {
          minLength: 7,
          maxLength: 7,
        }),
        endMonth: s.string("Ending month of the ranking range in YYYY-MM format.", {
          minLength: 7,
          maxLength: 7,
        }),
        includeTerms: termsSchema("Terms that must be present in historical keywords."),
        includeAnyTerm: s.boolean(
          "Whether a historical keyword may match any include term instead of all include terms.",
        ),
        excludeTerms: termsSchema("Terms that must not be present in historical keywords."),
        countryCode: countryCodeSchema,
        sortBy: s.stringEnum("Historical ranking field used for sorting.", [
          "ClicksChange",
          "EndClicks",
          "StartRank",
          "EndRank",
          "RankChange",
        ]),
        sortOrder: sortOrderSchema,
        pageSize: pageSizeSchema,
        startingRow: startingRowSchema,
      },
      {
        optional: [
          "queryType",
          "startMonth",
          "endMonth",
          "includeTerms",
          "includeAnyTerm",
          "excludeTerms",
          "countryCode",
          "sortBy",
          "sortOrder",
          "pageSize",
          "startingRow",
        ],
      },
    ),
    outputSchema: s.object(
      "Historical domain ranking rows and aggregate changes returned by SpyFu.",
      {
        resultCount: s.integer("Number of historical keyword rows returned.", { minimum: 0 }),
        totalMatchingResults: s.integer("Total matching historical keyword rows reported.", {
          minimum: 0,
        }),
        results: s.array("Historical keyword ranking rows returned by SpyFu.", resultRowSchema),
        totalVolume: s.integer("Combined search volume across matching historical keywords."),
        totalClicks: s.integer("Combined ending organic clicks across matching keywords."),
        totalClicksChange: s.integer("Combined organic click change across matching keywords."),
        totalRankChange: s.integer("Combined rank change across matching keywords."),
        rankAverage: s.number("Average ending rank across matching keywords."),
        rankAverageChange: s.number("Change in average rank across the selected month range."),
      },
      {
        optional: [
          "totalMatchingResults",
          "totalVolume",
          "totalClicks",
          "totalClicksChange",
          "totalRankChange",
          "rankAverage",
          "rankAverageChange",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_keyword_domain_rankings",
    description: "Compare one keyword's historical organic rankings across multiple domains.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for comparing a keyword's ranking history across domains.",
      {
        keyword: nonEmptyString("Keyword whose historical rankings should be compared."),
        domains: domainsSchema("Domains whose historical rankings should be compared."),
        startMonth: s.string("Beginning month of the ranking range in YYYY-MM format.", {
          minLength: 7,
          maxLength: 7,
        }),
        endMonth: s.string("Ending month of the ranking range in YYYY-MM format.", {
          minLength: 7,
          maxLength: 7,
        }),
        countryCode: countryCodeSchema,
      },
      { optional: ["startMonth", "endMonth", "countryCode"] },
    ),
    outputSchema: resultsOutputSchema("Historical ranking rows for one keyword across multiple domains."),
  }),
  defineProviderAction(service, {
    name: "get_domain_keyword_rankings",
    description: "Compare one domain's historical organic rankings across selected keywords.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for comparing a domain's ranking history across keywords.",
      {
        domain: nonEmptyString("Domain whose keyword ranking history should be compared."),
        keywords: s.stringArray("Keywords whose historical rankings should be compared.", {
          minItems: 1,
          maxItems: 50,
          itemDescription: "One keyword included in the ranking comparison.",
        }),
        startMonth: s.string("Beginning month of the ranking range in YYYY-MM format.", {
          minLength: 7,
          maxLength: 7,
        }),
        endMonth: s.string("Ending month of the ranking range in YYYY-MM format.", {
          minLength: 7,
          maxLength: 7,
        }),
        countryCode: countryCodeSchema,
      },
      { optional: ["startMonth", "endMonth", "countryCode"] },
    ),
    outputSchema: resultsOutputSchema("Historical ranking rows for one domain across selected keywords."),
  }),
  defineProviderAction(service, {
    name: "get_competitors",
    description: "Retrieve a domain's top SEO, PPC, or combined search competitors.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for finding SpyFu competitors.",
      {
        domain: nonEmptyString("Domain whose competitors should be discovered."),
        competitorType: s.stringEnum("Search channel used to identify competitors.", ["seo", "ppc", "combined"]),
        countryCode: countryCodeSchema,
        pageSize: s.integer("Maximum number of competitor rows to return.", {
          minimum: 1,
          maximum: 550,
        }),
        startingRow: s.integer("One-based competitor row offset.", {
          minimum: 1,
          maximum: 550,
        }),
        sortBy: s.stringEnum("Competitor field used for sorting.", ["Domain", "CommonTerms", "Rank"]),
        sortOrder: sortOrderSchema,
      },
      {
        optional: ["countryCode", "pageSize", "startingRow", "sortBy", "sortOrder"],
      },
    ),
    outputSchema: s.object(
      "Normalized SpyFu competitor response.",
      {
        competitorType: s.string("Search channel used to find these competitors."),
        resultCount: s.integer("Number of combined or primary competitor rows returned.", {
          minimum: 0,
        }),
        totalMatchingResults: s.integer("Total number of upstream competitor rows matching the query when reported.", {
          minimum: 0,
        }),
        results: s.array("Primary competitor rows returned by SpyFu.", resultRowSchema),
        ppcResults: s.array("PPC competitor rows returned in combined mode.", resultRowSchema),
        seoResults: s.array("SEO competitor rows returned in combined mode.", resultRowSchema),
      },
      { optional: ["totalMatchingResults", "ppcResults", "seoResults"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_competing_keywords",
    description: "Find SEO or PPC keywords shared by selected domains with optional exclusions.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for SpyFu Kombat keyword comparison.",
      {
        keywordType: s.stringEnum("Search channel compared by SpyFu Kombat.", ["seo", "ppc"]),
        includedDomains: domainsSchema("Domains whose keywords should seed the comparison."),
        excludedDomains: domainsSchema("Domains whose keywords should be removed from the result."),
        isIntersection: s.boolean(
          "Whether returned keywords must appear for every included domain instead of any domain.",
        ),
        countryCode: countryCodeSchema,
        pageSize: pageSizeSchema,
        startingRow: startingRowSchema,
        sortOrder: sortOrderSchema,
        adultFilter: s.boolean("Whether SpyFu should exclude adult keywords."),
      },
      {
        optional: ["excludedDomains", "countryCode", "pageSize", "startingRow", "sortOrder", "adultFilter"],
      },
    ),
    outputSchema: resultsOutputSchema("Competing keyword rows returned by SpyFu.", {
      keywordType: s.string("Search channel used for this keyword comparison."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_keyword_information",
    description: "Retrieve search, difficulty, click, cost, and intent metrics for exact keywords.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for bulk SpyFu keyword information.",
      {
        keywords: s.stringArray("Exact keywords to analyze.", {
          minItems: 1,
          maxItems: 100,
          itemDescription: "One exact keyword.",
        }),
        countryCode: countryCodeSchema,
        adultFilter: s.boolean("Whether SpyFu should exclude adult keywords."),
        onlyAdultKeywords: s.boolean("Whether SpyFu should return only adult keywords."),
      },
      { optional: ["countryCode", "adultFilter", "onlyAdultKeywords"] },
    ),
    outputSchema: resultsOutputSchema("Exact keyword information returned by SpyFu."),
  }),
  defineProviderAction(service, {
    name: "get_keyword_expansions",
    description: "Expand a seed keyword into related, question, transactional, co-ranking, or co-advertised terms.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for expanding a keyword with SpyFu.",
      {
        query: nonEmptyString("Seed keyword to expand."),
        keywordSearchType: s.stringEnum("Keyword relationship SpyFu should discover.", [
          "AlsoBuysAdsFor",
          "AlsoRanksFor",
          "PhraseMatch",
          "Questions",
          "Transactions",
        ]),
        ...sharedKeywordQueryProperties,
      },
      { optional: [...sharedKeywordOptionalFields] },
    ),
    outputSchema: resultsOutputSchema("Expanded keyword rows returned by SpyFu.", {
      keywordSearchType: s.string("Keyword relationship used for this expansion."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_ppc_keywords",
    description: "Retrieve current ads, most successful paid keywords, or newly acquired paid keywords for a domain.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for SpyFu PPC keyword research.",
      {
        query: nonEmptyString("Domain or URL whose paid search activity should be analyzed."),
        searchType: s.stringEnum("Paid search analysis performed by SpyFu.", [
          "current_ads",
          "most_successful",
          "newly_acquired",
        ]),
        excludeDomain: nonEmptyString("Domain to exclude from paid keyword results."),
        ...sharedKeywordQueryProperties,
      },
      { optional: ["excludeDomain", ...sharedKeywordOptionalFields] },
    ),
    outputSchema: resultsOutputSchema("PPC keyword or ad rows returned by SpyFu.", {
      searchType: s.string("Paid search analysis mode used for this response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_domain_ad_history",
    description: "Retrieve historical advertising copy and keywords for a domain.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving SpyFu domain ad history.",
      {
        domain: nonEmptyString("Advertiser root domain whose ad history should be returned."),
        keywordFilter: nonEmptyString("Keyword text used to filter the domain's ad history."),
        minSearchDateId: s.integer("Earliest ad capture date to include, formatted as YYYYMMDD.", {
          minimum: 19_000_101,
          maximum: 29_991_231,
        }),
        maxSearchDateId: s.integer("Latest ad capture date to include, formatted as YYYYMMDD.", {
          minimum: 19_000_101,
          maximum: 29_991_231,
        }),
        countryCode: countryCodeSchema,
        pageSize: pageSizeSchema,
        startingRow: s.integer("One-based ad history row offset.", { minimum: 1 }),
      },
      {
        optional: ["keywordFilter", "minSearchDateId", "maxSearchDateId", "countryCode", "pageSize", "startingRow"],
      },
    ),
    outputSchema: s.object(
      "Domain ad history rows and pagination metadata returned by SpyFu.",
      {
        resultCount: s.integer("Number of ad history rows returned in this response.", {
          minimum: 0,
        }),
        totalMatchingResults: s.integer("Total number of matching ad history rows reported.", {
          minimum: 0,
        }),
        totalMatchingResultsIsPartial: s.boolean("Whether SpyFu reports the total matching row count as partial."),
        startingRow: s.integer("One-based starting row returned by SpyFu.", { minimum: 1 }),
        pageSize: s.integer("Page size returned by SpyFu.", { minimum: 1 }),
        hasMoreResults: s.boolean("Whether more flattened ad history rows are available."),
        totalMatchingKeywords: s.integer("Total number of matching keywords reported by SpyFu.", {
          minimum: 0,
        }),
        hasMoreKeywordResults: s.boolean("Whether more backing keyword result groups are available."),
        results: s.array("Domain ad history rows returned by SpyFu.", resultRowSchema),
      },
      {
        optional: [
          "totalMatchingResults",
          "totalMatchingResultsIsPartial",
          "startingRow",
          "pageSize",
          "hasMoreResults",
          "totalMatchingKeywords",
          "hasMoreKeywordResults",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_keyword_ad_history",
    description: "Retrieve historical advertisers and ad copy for a keyword.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving SpyFu keyword ad history.",
      {
        term: nonEmptyString("Keyword whose advertising history should be returned."),
        countryCode: countryCodeSchema,
        pageSize: pageSizeSchema,
        startingRow: s.integer("One-based ad history row offset.", { minimum: 1 }),
      },
      { optional: ["countryCode", "pageSize", "startingRow"] },
    ),
    outputSchema: resultsOutputSchema("Keyword ad history rows returned by SpyFu."),
  }),
  defineProviderAction(service, {
    name: "get_keyword_ad_history_with_stats",
    description: "Retrieve keyword ad history enriched with advertiser budgets, coverage, and top-ad statistics.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving SpyFu keyword ad history with advertiser statistics.",
      {
        term: nonEmptyString("Keyword whose enriched advertising history should be returned."),
        countryCode: countryCodeSchema,
        pageSize: pageSizeSchema,
        startingRow: s.integer("One-based ad history row offset.", { minimum: 1 }),
      },
      { optional: ["countryCode", "pageSize", "startingRow"] },
    ),
    outputSchema: s.object("Keyword ad history and advertiser statistics returned by SpyFu.", {
      resultCount: s.integer("Number of advertiser history rows returned by SpyFu.", {
        minimum: 0,
      }),
      domains: s.array(
        "Advertiser domain statistics returned by SpyFu.",
        s.looseObject("One advertiser domain and its keyword advertising statistics."),
      ),
      topAds: s.array(
        "Top-performing ads returned by SpyFu.",
        s.looseObject("One top ad and its performance statistics."),
      ),
    }),
  }),
] as const satisfies ActionDefinition[];

export type SpyfuActionName =
  | "get_monthly_usage"
  | "get_usage_breakdown"
  | "get_latest_domain_stats"
  | "get_bulk_domain_stats"
  | "find_matching_domains"
  | "get_seo_keywords"
  | "get_top_pages"
  | "get_serp_analysis"
  | "get_live_seo_stats"
  | "get_domain_ranking_history"
  | "get_keyword_domain_rankings"
  | "get_domain_keyword_rankings"
  | "get_competitors"
  | "get_competing_keywords"
  | "get_keyword_information"
  | "get_keyword_expansions"
  | "get_ppc_keywords"
  | "get_domain_ad_history"
  | "get_keyword_ad_history"
  | "get_keyword_ad_history_with_stats";
