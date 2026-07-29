import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dataforseo" as const;

const nonEmptyString = (description: string) => s.string({ minLength: 1, description });

const looseNullableObject = (description: string) => s.nullable(s.looseObject(description));

const looseNullableObjectArray = (itemDescription: string, description: string) =>
  s.nullable(s.array(description, s.looseObject(itemDescription)));

const jsonValueSchema = s.anyOf("A JSON value accepted by DataForSEO for filters or options.", [
  s.string("A string JSON value."),
  s.number("A numeric JSON value."),
  s.boolean("A boolean JSON value."),
  s.array("A nested JSON array value.", s.unknown("A nested JSON array item.")),
  s.looseObject("A nested JSON object value."),
]);

const optionalStringArray = (description: string, itemDescription: string) =>
  s.array(description, nonEmptyString(itemDescription), {
    minItems: 1,
  });

const dataForSeoTaskSchema = s.object(
  "Metadata for the first DataForSEO task returned by the endpoint.",
  {
    id: s.string("DataForSEO task identifier."),
    status_code: s.integer("DataForSEO task status code."),
    status_message: s.string("DataForSEO task status message."),
    time: s.string("Task execution time reported by DataForSEO."),
    cost: s.number("Task cost in USD reported by DataForSEO."),
    result_count: s.integer("Number of result objects returned by the task."),
  },
  {
    optional: ["id", "time", "cost", "result_count"],
    additionalProperties: true,
  },
);

const dataForSeoResultOutput = (description: string) =>
  s.object(
    description,
    {
      task: dataForSeoTaskSchema,
      results: looseNullableObjectArray(
        "One result object returned by DataForSEO.",
        "Result objects returned by DataForSEO for the first task.",
      ),
    },
    {
      optional: ["task", "results"],
    },
  );

const dataForSeoAsyncTaskSchema = s.requiredObject(
  "Normalized metadata and lifecycle state for one DataForSEO asynchronous task.",
  {
    id: s.nullableString("DataForSEO task identifier when the task was accepted."),
    state: s.stringEnum("Connector lifecycle state derived from the DataForSEO task status.", [
      "running",
      "succeeded",
      "failed",
    ]),
    status_code: s.nullableInteger("DataForSEO task status code."),
    status_message: s.nullableString("DataForSEO task status message."),
    time: s.nullableString("Task execution time reported by DataForSEO."),
    cost: s.nullableNumber("Task cost in USD reported by DataForSEO."),
    result_count: s.nullableInteger("Number of result objects returned by the task."),
    path: s.array("Request path components returned for the task.", s.string("One path component.")),
    data: s.looseObject("Original task input metadata returned by DataForSEO."),
    raw: s.looseObject("Complete task object returned by DataForSEO."),
  },
);

const dataForSeoAsyncErrorSchema = s.requiredObject(
  "A DataForSEO task error retained in a non-throwing asynchronous result.",
  {
    status_code: s.nullableInteger("DataForSEO task error status code."),
    status_message: s.nullableString("DataForSEO task error status message."),
    raw: s.looseObject("Complete failed task object returned by DataForSEO."),
  },
);

const dataForSeoAsyncOutput = (description: string) =>
  s.requiredObject(description, {
    task: dataForSeoAsyncTaskSchema,
    results: s.array(
      "Result objects returned by DataForSEO for the task.",
      s.looseObject("One result object returned by DataForSEO."),
    ),
    errors: s.array(
      "Task errors returned by DataForSEO without discarding task status or cost.",
      dataForSeoAsyncErrorSchema,
    ),
    cost: s.nullableNumber("Total response cost in USD reported by DataForSEO."),
    raw: s.looseObject("Complete DataForSEO response envelope."),
  });

const getUserDataOutputSchema = s.object(
  "Normalized account details returned by the DataForSEO User Data endpoint.",
  {
    login: s.string("DataForSEO API login for the account."),
    timezone: s.string("Timezone configured in the DataForSEO profile."),
    money: looseNullableObject("Account spending and balance details returned by DataForSEO."),
    rates: looseNullableObject("API rate information returned by DataForSEO."),
    limits: looseNullableObject("API limit information returned by DataForSEO."),
    statistics: looseNullableObject("API usage statistics returned by DataForSEO."),
  },
  {
    optional: ["login", "timezone", "money", "rates", "limits", "statistics"],
    additionalProperties: true,
  },
);

const googleLocationInput = {
  locationName: nonEmptyString("Full name of the location to target in DataForSEO."),
  locationCode: s.integer("Numeric DataForSEO location code to target."),
  languageName: nonEmptyString("Full name of the language to target in DataForSEO."),
  languageCode: nonEmptyString("DataForSEO language code to target."),
} as const;

const googleLocationOptionalKeys = ["locationName", "locationCode", "languageName", "languageCode"] as const;

const amazonPrioritySchema: JsonSchema = {
  type: "integer",
  enum: [1, 2],
  description: "Task priority: 1 for normal execution or 2 for faster execution at an additional cost.",
};

const amazonTargetingInput = {
  priority: amazonPrioritySchema,
  locationName: nonEmptyString("Full name of the Amazon location to target."),
  locationCode: s.integer("Numeric DataForSEO Amazon location code to target."),
  locationCoordinate: nonEmptyString("GPS coordinates and radius in the `latitude,longitude,radius` format."),
  languageName: nonEmptyString("Full name of the Amazon language to target."),
  languageCode: nonEmptyString("DataForSEO Amazon language code to target."),
  seDomain: nonEmptyString("Amazon search engine domain, such as `amazon.com`."),
  tag: s.nonEmptyString("User-defined task tag passed through to DataForSEO.", {
    maxLength: 255,
  }),
} as const;

const amazonTargetingOptionalKeys = [
  "priority",
  "locationName",
  "locationCode",
  "locationCoordinate",
  "languageName",
  "languageCode",
  "seDomain",
  "tag",
] as const;

const requireAmazonTargeting = (schema: JsonSchema): JsonSchema => ({
  ...schema,
  allOf: [
    {
      anyOf: [{ required: ["locationName"] }, { required: ["locationCode"] }, { required: ["locationCoordinate"] }],
    },
    {
      anyOf: [{ required: ["languageName"] }, { required: ["languageCode"] }],
    },
  ],
});

const amazonProductsInputSchema = requireAmazonTargeting(
  s.object(
    "Input for submitting one DataForSEO Amazon Products Standard task.",
    {
      keyword: s.nonEmptyString("Product keyword to search on Amazon.", {
        maxLength: 700,
      }),
      url: s.url("Direct Amazon search URL to parse in addition to the required keyword."),
      ...amazonTargetingInput,
      depth: s.integer("Maximum number of Amazon product results to retrieve.", {
        minimum: 1,
        maximum: 700,
      }),
      maxCrawlPages: s.integer("Maximum number of Amazon search result pages to crawl.", {
        minimum: 1,
        maximum: 7,
      }),
      department: s.stringEnum("Amazon product department used to narrow the search.", [
        "Arts & Crafts",
        "Automotive",
        "Baby",
        "Beauty & Personal Care",
        "Books",
        "Computers",
        "Digital Music",
        "Electronics",
        "Kindle Store",
        "Prime Video",
        "Women's Fashion",
        "Men's Fashion",
        "Girls' Fashion",
        "Boys' Fashion",
        "Deals",
        "Health & Household",
        "Home & Kitchen",
        "Industrial & Scientific",
        "Luggage",
        "Movies & TV",
        "Music, CDs & Vinyl",
        "Pet Supplies",
        "Software",
        "Sports & Outdoors",
        "Tools & Home Improvement",
        "Toys & Games",
        "Video Games",
      ]),
      searchParam: nonEmptyString("Additional Amazon search URL parameters."),
      priceMin: s.integer("Minimum product price used to filter Amazon results."),
      priceMax: s.integer("Maximum product price used to filter Amazon results."),
      sortBy: s.stringEnum("Amazon product result sorting rule.", [
        "relevance",
        "price_low_to_high",
        "price_high_to_low",
        "featured",
        "avg_customer_review",
        "newest_arrival",
      ]),
    },
    {
      optional: [
        "url",
        ...amazonTargetingOptionalKeys,
        "depth",
        "maxCrawlPages",
        "department",
        "searchParam",
        "priceMin",
        "priceMax",
        "sortBy",
      ],
    },
  ),
);

const amazonAsinInputSchema = requireAmazonTargeting(
  s.object(
    "Input for submitting one DataForSEO Amazon ASIN Standard task.",
    {
      asin: nonEmptyString("Amazon Standard Identification Number for the product."),
      ...amazonTargetingInput,
    },
    {
      optional: amazonTargetingOptionalKeys,
    },
  ),
);

const amazonSellersInputSchema = requireAmazonTargeting(
  s.object(
    "Input for submitting one DataForSEO Amazon Sellers Standard task.",
    {
      asin: nonEmptyString("Amazon Standard Identification Number for the product."),
      ...amazonTargetingInput,
    },
    {
      optional: amazonTargetingOptionalKeys,
    },
  ),
);

const amazonTaskResultInputSchema = s.actionInput(
  {
    id: s.uuid("Task identifier returned by the matching Amazon Merchant submit action."),
  },
  ["id"],
  "Input identifying one DataForSEO Amazon Merchant task.",
);

const amazonLifecycle = (submitAction: string, resultAction: string) => ({
  startActionId: `dataforseo.${submitAction}`,
  statusActionId: `dataforseo.${resultAction}`,
});

const requireGoogleLocation = (schema: Record<string, unknown>) => schema;

const commonListInput = {
  limit: s.integer("Maximum number of returned items.", {
    minimum: 1,
    maximum: 1000,
  }),
  offset: s.nonNegativeInteger("Offset in the returned results array."),
  filters: s.array("DataForSEO filter expression.", jsonValueSchema, {
    minItems: 1,
  }),
  orderBy: optionalStringArray("DataForSEO sorting rules.", "One DataForSEO sorting rule."),
  tag: nonEmptyString("User-defined task tag passed through to DataForSEO."),
} as const;

const commonListOptionalKeys = ["limit", "offset", "filters", "orderBy", "tag"] as const;

const labsDomainBaseInput = {
  target: nonEmptyString("Target domain sent to DataForSEO without protocol or www."),
  ...googleLocationInput,
} as const;

const serpItemTypesSchema = optionalStringArray(
  "Search result item types included in DataForSEO Labs calculations.",
  "One search result item type.",
);

const backlinksCommonInput = {
  target: nonEmptyString("Domain, subdomain, or absolute page URL sent to DataForSEO Backlinks."),
  backlinksStatusType: s.stringEnum("Backlink status type used for metrics.", ["all", "live", "lost"]),
  includeSubdomains: s.boolean("Whether subdomains of the target are included."),
  includeIndirectLinks: s.boolean("Whether indirect links are included."),
  excludeInternalBacklinks: s.boolean("Whether internal backlinks from subdomains are excluded."),
  rankScale: s.stringEnum("Scale used for backlink rank metrics.", ["one_hundred", "one_thousand"]),
  tag: nonEmptyString("User-defined task tag passed through to DataForSEO."),
} as const;

const backlinksListInput = {
  limit: s.integer("Maximum number of returned items.", {
    minimum: 1,
    maximum: 1000,
  }),
  offset: s.nonNegativeInteger("Offset in the returned results array."),
  filters: s.array("DataForSEO Backlinks filter expression.", jsonValueSchema, {
    minItems: 1,
  }),
  orderBy: optionalStringArray("DataForSEO Backlinks sorting rules.", "One sorting rule."),
} as const;

const backlinksAggregateInput = {
  internalListLimit: s.integer("Maximum number of elements in internal aggregate arrays.", {
    minimum: 1,
    maximum: 1000,
  }),
  backlinksFilters: s.array("Initial backlinks dataset filter expression.", jsonValueSchema, {
    minItems: 1,
  }),
} as const;

const backlinksCommonOptionalKeys = [
  "backlinksStatusType",
  "includeSubdomains",
  "includeIndirectLinks",
  "excludeInternalBacklinks",
  "rankScale",
  "tag",
] as const;

const backlinksListOptionalKeys = ["limit", "offset", "filters", "orderBy"] as const;

const backlinksAggregateOptionalKeys = ["internalListLimit", "backlinksFilters"] as const;

const serpInputSchema = s.object(
  "Input parameters for running a DataForSEO Google Organic SERP Live Advanced request.",
  {
    keyword: nonEmptyString("Search keyword sent to DataForSEO."),
    ...googleLocationInput,
    device: s.stringEnum("Device type used for the SERP request.", ["desktop", "mobile"]),
    os: nonEmptyString("Operating system name sent to DataForSEO for mobile or desktop requests."),
    depth: s.integer("Maximum SERP depth to retrieve.", {
      minimum: 1,
      maximum: 700,
    }),
    tag: nonEmptyString("User-defined task tag passed through to DataForSEO."),
  },
  {
    optional: [...googleLocationOptionalKeys, "device", "os", "depth", "tag"],
  },
);

const searchVolumeInputSchema = s.object(
  "Input parameters for retrieving Google Ads search volume through DataForSEO.",
  {
    keywords: s.array("Keywords to request search volume for.", nonEmptyString("One keyword sent to DataForSEO."), {
      minItems: 1,
      maxItems: 1000,
    }),
    ...googleLocationInput,
    tag: nonEmptyString("User-defined task tag passed through to DataForSEO."),
  },
  {
    optional: [...googleLocationOptionalKeys, "tag"],
  },
);

const keywordSuggestionsInputSchema = s.object(
  "Input parameters for retrieving DataForSEO Labs Google keyword suggestions.",
  {
    keyword: nonEmptyString("Seed keyword used to generate keyword suggestions."),
    ...googleLocationInput,
    limit: s.integer("Maximum number of keyword suggestions to return.", {
      minimum: 1,
      maximum: 1000,
    }),
    includeSeedKeyword: s.boolean("Whether to include the seed keyword in the response."),
    tag: nonEmptyString("User-defined task tag passed through to DataForSEO."),
  },
  {
    optional: [...googleLocationOptionalKeys, "limit", "includeSeedKeyword", "tag"],
  },
);

const keywordOverviewInputSchema = s.object(
  "Input parameters for retrieving DataForSEO Labs Google keyword overview metrics.",
  {
    keywords: s.array("Keywords sent to DataForSEO Labs.", nonEmptyString("One keyword."), {
      minItems: 1,
      maxItems: 700,
    }),
    ...googleLocationInput,
    includeSerpInfo: s.boolean("Whether to include SERP information for each keyword."),
    includeClickstreamData: s.boolean("Whether to include clickstream-based metrics."),
    tag: nonEmptyString("User-defined task tag passed through to DataForSEO."),
  },
  {
    optional: [...googleLocationOptionalKeys, "includeSerpInfo", "includeClickstreamData", "tag"],
  },
);

const keywordIdeasInputSchema = requireGoogleLocation(
  s.object(
    "Input parameters for retrieving DataForSEO Labs Google keyword ideas.",
    {
      keywords: s.array("Seed keywords sent to DataForSEO Labs.", nonEmptyString("One keyword."), {
        minItems: 1,
        maxItems: 200,
      }),
      ...googleLocationInput,
      closelyVariants: s.boolean("Whether phrase-match search mode is used."),
      ignoreSynonyms: s.boolean("Whether to exclude highly similar keywords."),
      includeSerpInfo: s.boolean("Whether to include SERP information for each keyword."),
      includeClickstreamData: s.boolean("Whether to include clickstream-based metrics."),
      ...commonListInput,
      offsetToken: nonEmptyString("Offset token for subsequent keyword idea requests."),
    },
    {
      optional: [
        ...googleLocationOptionalKeys,
        "closelyVariants",
        "ignoreSynonyms",
        "includeSerpInfo",
        "includeClickstreamData",
        ...commonListOptionalKeys,
        "offsetToken",
      ],
    },
  ),
);

const keywordsForSiteInputSchema = requireGoogleLocation(
  s.object(
    "Input parameters for retrieving DataForSEO Labs Google keywords for a site.",
    {
      ...labsDomainBaseInput,
      includeSerpInfo: s.boolean("Whether to include SERP information for each keyword."),
      includeSubdomains: s.boolean("Whether subdomains are included in the keyword search."),
      includeClickstreamData: s.boolean("Whether to include clickstream-based metrics."),
      ...commonListInput,
      offsetToken: nonEmptyString("Offset token for subsequent keyword requests."),
    },
    {
      optional: [
        ...googleLocationOptionalKeys,
        "includeSerpInfo",
        "includeSubdomains",
        "includeClickstreamData",
        ...commonListOptionalKeys,
        "offsetToken",
      ],
    },
  ),
);

const serpCompetitorsInputSchema = requireGoogleLocation(
  s.object(
    "Input parameters for retrieving DataForSEO Labs Google SERP competitors.",
    {
      keywords: s.array("Keywords used to find SERP competitors.", nonEmptyString("One keyword."), {
        minItems: 1,
        maxItems: 200,
      }),
      locationName: googleLocationInput.locationName,
      locationCode: googleLocationInput.locationCode,
      includeSubdomains: s.boolean("Whether subdomains are included in the competitor search."),
      itemTypes: serpItemTypesSchema,
      ...commonListInput,
    },
    {
      optional: ["locationName", "locationCode", "includeSubdomains", "itemTypes", ...commonListOptionalKeys],
    },
  ),
);

const domainRankOverviewInputSchema = s.object(
  "Input parameters for retrieving DataForSEO Labs Google domain rank overview.",
  {
    ...labsDomainBaseInput,
    ignoreSynonyms: s.boolean("Whether to exclude highly similar keywords."),
    limit: s.integer("Maximum number of returned domain rank overview items.", {
      minimum: 1,
      maximum: 1000,
    }),
    offset: s.nonNegativeInteger("Offset in the returned results array."),
    tag: nonEmptyString("User-defined task tag passed through to DataForSEO."),
  },
  {
    optional: [...googleLocationOptionalKeys, "ignoreSynonyms", "limit", "offset", "tag"],
  },
);

const relevantPagesInputSchema = s.object(
  "Input parameters for retrieving DataForSEO Labs Google relevant pages for a domain.",
  {
    target: nonEmptyString("Target domain sent to DataForSEO without protocol or www."),
    ignoreSynonyms: s.boolean("Whether to exclude highly similar keywords."),
    includeClickstreamData: s.boolean("Whether to include clickstream-based metrics."),
    ...commonListInput,
    itemTypes: serpItemTypesSchema,
    historicalSerpMode: s.stringEnum("Historical SERP mode used for relevant pages.", ["live", "lost", "all"]),
  },
  {
    optional: [
      "ignoreSynonyms",
      "includeClickstreamData",
      ...commonListOptionalKeys,
      "itemTypes",
      "historicalSerpMode",
    ],
  },
);

const backlinksSummaryInputSchema = s.object(
  "Input parameters for retrieving a DataForSEO Backlinks summary.",
  {
    ...backlinksCommonInput,
    ...backlinksAggregateInput,
  },
  {
    optional: [...backlinksCommonOptionalKeys, ...backlinksAggregateOptionalKeys],
  },
);

const backlinksListInputSchema = s.object(
  "Input parameters for retrieving a DataForSEO Backlinks list.",
  {
    ...backlinksCommonInput,
    ...backlinksListInput,
    mode: s.stringEnum("Backlink grouping mode.", ["as_is", "one_per_domain", "one_per_anchor"]),
    customMode: s.looseObject("Detailed backlink grouping object accepted by DataForSEO."),
    searchAfterToken: nonEmptyString("Token for subsequent backlinks list requests."),
  },
  {
    optional: [...backlinksCommonOptionalKeys, ...backlinksListOptionalKeys, "mode", "customMode", "searchAfterToken"],
  },
);

const backlinksReferringDomainsInputSchema = s.object(
  "Input parameters for retrieving DataForSEO Backlinks referring domains.",
  {
    ...backlinksCommonInput,
    ...backlinksListInput,
    ...backlinksAggregateInput,
  },
  {
    optional: [...backlinksCommonOptionalKeys, ...backlinksListOptionalKeys, ...backlinksAggregateOptionalKeys],
  },
);

const backlinksAnchorsInputSchema = s.object(
  "Input parameters for retrieving DataForSEO Backlinks anchors.",
  {
    ...backlinksCommonInput,
    ...backlinksListInput,
    ...backlinksAggregateInput,
  },
  {
    optional: [...backlinksCommonOptionalKeys, ...backlinksListOptionalKeys, ...backlinksAggregateOptionalKeys],
  },
);

export const dataForSeoActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_data",
    description: "Retrieve DataForSEO account details, balance, rates, limits, and usage data.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving DataForSEO user data.", {}),
    outputSchema: getUserDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_amazon_products_task",
    description: "Submit one Standard DataForSEO Amazon Products task for asynchronous product listing research.",
    followUpActions: ["dataforseo.get_amazon_products_task"],
    asyncLifecycle: amazonLifecycle("submit_amazon_products_task", "get_amazon_products_task"),
    inputSchema: amazonProductsInputSchema,
    outputSchema: dataForSeoAsyncOutput("The accepted or failed DataForSEO Amazon Products task submission."),
  }),
  defineProviderAction(service, {
    name: "get_amazon_products_task",
    description: "Retrieve the status and Advanced results of one DataForSEO Amazon Products task.",
    asyncLifecycle: amazonLifecycle("submit_amazon_products_task", "get_amazon_products_task"),
    inputSchema: amazonTaskResultInputSchema,
    outputSchema: dataForSeoAsyncOutput("The current DataForSEO Amazon Products task status and results."),
  }),
  defineProviderAction(service, {
    name: "submit_amazon_asins_task",
    description: "Submit one Standard DataForSEO Amazon ASIN task for asynchronous product variant research.",
    followUpActions: ["dataforseo.get_amazon_asins_task"],
    asyncLifecycle: amazonLifecycle("submit_amazon_asins_task", "get_amazon_asins_task"),
    inputSchema: amazonAsinInputSchema,
    outputSchema: dataForSeoAsyncOutput("The accepted or failed DataForSEO Amazon ASIN task submission."),
  }),
  defineProviderAction(service, {
    name: "get_amazon_asins_task",
    description: "Retrieve the status and Advanced results of one DataForSEO Amazon ASIN task.",
    asyncLifecycle: amazonLifecycle("submit_amazon_asins_task", "get_amazon_asins_task"),
    inputSchema: amazonTaskResultInputSchema,
    outputSchema: dataForSeoAsyncOutput("The current DataForSEO Amazon ASIN task status and results."),
  }),
  defineProviderAction(service, {
    name: "submit_amazon_sellers_task",
    description: "Submit one Standard DataForSEO Amazon Sellers task for asynchronous offer and seller research.",
    followUpActions: ["dataforseo.get_amazon_sellers_task"],
    asyncLifecycle: amazonLifecycle("submit_amazon_sellers_task", "get_amazon_sellers_task"),
    inputSchema: amazonSellersInputSchema,
    outputSchema: dataForSeoAsyncOutput("The accepted or failed DataForSEO Amazon Sellers task submission."),
  }),
  defineProviderAction(service, {
    name: "get_amazon_sellers_task",
    description: "Retrieve the status and Advanced results of one DataForSEO Amazon Sellers task.",
    asyncLifecycle: amazonLifecycle("submit_amazon_sellers_task", "get_amazon_sellers_task"),
    inputSchema: amazonTaskResultInputSchema,
    outputSchema: dataForSeoAsyncOutput("The current DataForSEO Amazon Sellers task status and results."),
  }),
  defineProviderAction(service, {
    name: "list_amazon_tasks_ready",
    description: "List uncollected completed Amazon Products, ASIN, and Sellers tasks from DataForSEO Merchant API.",
    inputSchema: s.actionInput({}, [], "The input payload for listing ready Amazon Merchant tasks."),
    outputSchema: dataForSeoAsyncOutput(
      "The DataForSEO Merchant tasks-ready response filtered to supported Amazon task families.",
    ),
  }),
  defineProviderAction(service, {
    name: "google_organic_live_advanced",
    description: "Run a DataForSEO Google Organic SERP Live Advanced request for one search keyword.",
    requiredScopes: [],
    inputSchema: serpInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Google Organic SERP Live Advanced output."),
  }),
  defineProviderAction(service, {
    name: "google_ads_search_volume_live",
    description: "Retrieve Google Ads search volume metrics from DataForSEO for one batch of keywords.",
    requiredScopes: [],
    inputSchema: searchVolumeInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Google Ads Search Volume Live output."),
  }),
  defineProviderAction(service, {
    name: "google_keyword_suggestions_live",
    description: "Retrieve DataForSEO Labs Google keyword suggestions for one seed keyword.",
    requiredScopes: [],
    inputSchema: keywordSuggestionsInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Labs Google Keyword Suggestions Live output."),
  }),
  defineProviderAction(service, {
    name: "google_keyword_overview_live",
    description: "Retrieve DataForSEO Labs Google keyword overview metrics for a batch of keywords.",
    requiredScopes: [],
    inputSchema: keywordOverviewInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Labs Google Keyword Overview Live output."),
  }),
  defineProviderAction(service, {
    name: "google_keyword_ideas_live",
    description: "Retrieve DataForSEO Labs Google keyword ideas for seed keywords.",
    requiredScopes: [],
    inputSchema: keywordIdeasInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Labs Google Keyword Ideas Live output."),
  }),
  defineProviderAction(service, {
    name: "google_keywords_for_site_live",
    description: "Retrieve DataForSEO Labs Google keyword ideas relevant to a target domain.",
    requiredScopes: [],
    inputSchema: keywordsForSiteInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Labs Google Keywords For Site Live output."),
  }),
  defineProviderAction(service, {
    name: "google_serp_competitors_live",
    description: "Retrieve domains competing in Google SERPs for the specified keywords.",
    requiredScopes: [],
    inputSchema: serpCompetitorsInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Labs Google SERP Competitors Live output."),
  }),
  defineProviderAction(service, {
    name: "google_domain_rank_overview_live",
    description: "Retrieve DataForSEO Labs Google ranking and traffic overview for a domain.",
    requiredScopes: [],
    inputSchema: domainRankOverviewInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Labs Google Domain Rank Overview Live output."),
  }),
  defineProviderAction(service, {
    name: "google_relevant_pages_live",
    description: "Retrieve ranking and traffic metrics for the most relevant pages of a domain.",
    requiredScopes: [],
    inputSchema: relevantPagesInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Labs Google Relevant Pages Live output."),
  }),
  defineProviderAction(service, {
    name: "backlinks_summary_live",
    description: "Retrieve DataForSEO Backlinks summary metrics for a domain, subdomain, or page.",
    requiredScopes: [],
    inputSchema: backlinksSummaryInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Backlinks Summary Live output."),
  }),
  defineProviderAction(service, {
    name: "backlinks_list_live",
    description: "Retrieve DataForSEO Backlinks records for a domain, subdomain, or page.",
    requiredScopes: [],
    inputSchema: backlinksListInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Backlinks List Live output."),
  }),
  defineProviderAction(service, {
    name: "backlinks_referring_domains_live",
    description: "Retrieve DataForSEO Backlinks referring domains for a domain, subdomain, or page.",
    requiredScopes: [],
    inputSchema: backlinksReferringDomainsInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Backlinks Referring Domains Live output."),
  }),
  defineProviderAction(service, {
    name: "backlinks_anchors_live",
    description: "Retrieve DataForSEO Backlinks anchor text metrics for a domain, subdomain, or page.",
    requiredScopes: [],
    inputSchema: backlinksAnchorsInputSchema,
    outputSchema: dataForSeoResultOutput("Normalized DataForSEO Backlinks Anchors Live output."),
  }),
];

export const dataForSeoActionByName: ReadonlyMap<string, ProviderActionDefinition> = new Map(
  dataForSeoActions.map((action) => [action.name, action] as const),
);
