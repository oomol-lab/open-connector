import { optionalRecord } from "../../core/cast.ts";
import { readSchemaProperties } from "../../core/json-schema.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { answerRoutes } from "./answer-actions.ts";
import { braveRichRoutes } from "./brave-rich-actions.ts";
import { commercialResearchRoutes } from "./commercial-research-actions.ts";
import { cryptoResearchRoutes } from "./crypto-research-routes.ts";
import { dataForSeoInstantRoutes } from "./dataforseo-instant-actions.ts";
import { dataForSeoOnPageRoutes } from "./dataforseo-onpage-actions.ts";
import { dataForSeoResearchContracts } from "./dataforseo-research-actions.ts";
import { dataForSeoTaskRoutes } from "./dataforseo-task-actions.ts";
import { discoveryRoutes } from "./discovery-actions.ts";
import { aisaFirecrawlFamilies } from "./firecrawl-actions.ts";
import { macroResearchRoutes } from "./macro-research-actions.ts";
import { pinterestResearchRoutes } from "./pinterest-research-actions.ts";
import { polymarketResearchRoutes } from "./polymarket-research-actions.ts";
import { publicUtilityRoutes } from "./public-utility-actions.ts";
import { regionalResearchRoutes } from "./regional-research-actions.ts";
import { researchTaskRoutes } from "./research-task-actions.ts";
import { searchResearchRoutes } from "./search-research-actions.ts";
import { nativeSocialRoutes } from "./social-research-actions.ts";
import { twitterResearchRoutes } from "./twitter-research-actions.ts";
import { weatherRoutes } from "./weather-actions.ts";

export interface AisaActionRoute {
  path: string;
  method?: "GET" | "POST";
  query: Record<string, string | readonly string[]>;
  commaSeparated?: readonly string[];
  joined?: Record<string, string>;
  body?: Record<string, string>;
  bodyInput?: string;
  bodyArray?: boolean;
  snakeCaseBody?: boolean;
  bodyKeyAliases?: Record<string, string>;
  headers?: Record<string, string>;
  pathParams?: Record<string, string>;
  fixedQuery?: Record<string, string>;
  omitQueryDefaults?: Record<string, unknown>;
  response?: AisaSemicolonResponse;
  bodyDefaults?: Record<string, unknown>;
  timeoutMs?: number;
  asyncJob?: "submit" | "get" | "cancel";
  dataForSeoTask?: "submit" | "get";
  onPageTask?: "submit" | "summary" | "report" | "cancel";
}

export interface AisaSemicolonResponse {
  type: "semicolon";
  header: "required" | "optional";
  columns?: readonly string[];
  headerAliases?: readonly (readonly string[])[];
}

function dataForSeoRoute(path: string, body: Record<string, string>): AisaActionRoute {
  return { path, method: "POST", query: {}, body, bodyArray: true, snakeCaseBody: true };
}

function dataForSeoLlmRoute(path: string): AisaActionRoute {
  return dataForSeoRoute(path, {
    prompt: "userPrompt",
    model: "modelName",
    maxOutputTokens: "maxOutputTokens",
    temperature: "temperature",
    topP: "topP",
    webSearch: "webSearch",
    forceWebSearch: "forceWebSearch",
    webSearchCountryCode: "webSearchCountryIsoCode",
    webSearchCity: "webSearchCity",
    systemMessage: "systemMessage",
    messageChain: "messageChain",
    useReasoning: "useReasoning",
    tag: "tag",
  });
}

const similarwebMonthQuery = {
  startMonth: "start_date",
  endMonth: "end_date",
  country: "country",
  webSource: "web_source",
  mainDomainOnly: "main_domain_only",
};

const similarwebRowsQuery = {
  domain: "domain",
  ...similarwebMonthQuery,
  limit: "limit",
  offset: "offset",
  trafficSource: "traffic_source",
};

export const aisaActionRoutes: Record<string, AisaActionRoute> = {
  ...answerRoutes,
  ...pinterestResearchRoutes,
  ...researchTaskRoutes,
  ...dataForSeoTaskRoutes,
  ...dataForSeoOnPageRoutes,
  ...dataForSeoInstantRoutes,
  ...publicUtilityRoutes,
  ...nativeSocialRoutes,
  ...braveRichRoutes,
  ...regionalResearchRoutes,
  ...polymarketResearchRoutes,
  ...twitterResearchRoutes,
  ...macroResearchRoutes,
  ...searchResearchRoutes,
  ...weatherRoutes,
  ...commercialResearchRoutes,
  ...discoveryRoutes,
  ...cryptoResearchRoutes,
  search_reddit_subreddit: {
    path: "/apis/v1/reddit/subreddit/search",
    query: {
      cursor: "cursor",
      query: "query",
      sort: "sort",
      subreddit: "subreddit",
      timeframe: "timeframe",
    },
  },
  get_reddit_post_comments: {
    path: "/apis/v1/reddit/post/comments",
    query: {
      cursor: "cursor",
      trim: "trim",
      trimmed: "trimmed",
      url: "url",
    },
  },
  search_reddit_posts: {
    path: "/apis/v1/reddit/search",
    query: {
      after: "after",
      count: "count",
      filter: "filter",
      limit: "limit",
      query: "query",
      sort: "sort",
      time: "time",
      timeframe: "timeframe",
      trim: "trim",
      trimmed: "trimmed",
    },
  },
  get_fred_release_dates: {
    path: "/apis/v1/fred/releases/dates",
    query: {
      includeReleaseDatesWithNoData: "include_release_dates_with_no_data",
      limit: "limit",
      offset: "offset",
      orderBy: "order_by",
      realtimeEnd: "realtime_end",
      realtimeStart: "realtime_start",
      sortOrder: "sort_order",
    },
    fixedQuery: {
      file_type: "json",
    },
  },
  get_fred_observations: {
    path: "/apis/v1/fred/series/observations",
    query: {
      aggregationMethod: "aggregation_method",
      frequency: "frequency",
      limit: "limit",
      observationEnd: "observation_end",
      observationStart: "observation_start",
      offset: "offset",
      outputType: "output_type",
      realtimeEnd: "realtime_end",
      realtimeStart: "realtime_start",
      seriesId: "series_id",
      sortOrder: "sort_order",
      units: "units",
      vintageDates: "vintage_dates",
    },
    fixedQuery: {
      file_type: "json",
    },
  },
  get_fred_series: {
    path: "/apis/v1/fred/series",
    query: {
      realtimeEnd: "realtime_end",
      realtimeStart: "realtime_start",
      seriesId: "series_id",
    },
    fixedQuery: {
      file_type: "json",
    },
  },
  search_fred_series: {
    path: "/apis/v1/fred/series/search",
    query: {
      excludeTagNames: "exclude_tag_names",
      filterValue: "filter_value",
      filterVariable: "filter_variable",
      limit: "limit",
      offset: "offset",
      orderBy: "order_by",
      realtimeEnd: "realtime_end",
      realtimeStart: "realtime_start",
      searchText: "search_text",
      searchType: "search_type",
      sortOrder: "sort_order",
      tagNames: "tag_names",
    },
    fixedQuery: {
      file_type: "json",
    },
  },
  get_company_non_gaap_metrics: {
    path: "/apis/v1/financial/kpi/non-gaap",
    query: {
      cursor: "cursor",
      limit: "limit",
      metricName: "metric_name",
      period: "period",
      reportPeriodGte: "report_period_gte",
      reportPeriodLte: "report_period_lte",
      ticker: "ticker",
    },
  },
  get_company_kpis: {
    path: "/apis/v1/financial/kpi/metrics",
    query: {
      cursor: "cursor",
      limit: "limit",
      metricName: "metric_name",
      period: "period",
      reportPeriodGte: "report_period_gte",
      reportPeriodLte: "report_period_lte",
      ticker: "ticker",
    },
  },
  get_company_guidance: {
    path: "/apis/v1/financial/kpi/guidance",
    query: {
      cursor: "cursor",
      limit: "limit",
      metricName: "metric_name",
      period: "period",
      reportPeriodGte: "report_period_gte",
      reportPeriodLte: "report_period_lte",
      ticker: "ticker",
    },
  },
  search_financial_line_items: {
    path: "/apis/v1/financial/financials/search/line-items",
    query: {},
    method: "POST",
    body: {
      limit: "limit",
      lineItems: "line_items",
      period: "period",
      tickers: "tickers",
    },
  },
  screen_stocks: {
    path: "/apis/v1/financial/financials/search/screener",
    query: {},
    method: "POST",
    body: {
      filters: "filters",
      limit: "limit",
    },
  },
  search_firecrawl: {
    path: "/apis/v1/firecrawl/search",
    method: "POST",
    query: {},
    body: { query: "query", limit: "limit" },
    bodyDefaults: { sources: ["web"] },
  },
  search_akta_companies: { path: "/apis/v1/akta/company/search", query: { query: "query" } },
  enrich_akta_company: {
    path: "/apis/v1/akta/company/enrichment",
    query: { company: "company", sections: "sections" },
  },
  search_akta_industries: {
    path: "/apis/v1/akta/industry/search",
    query: { query: "query", level: "level" },
  },
  search_akta_company_list: {
    path: "/apis/v1/akta/list/generate/companies",
    method: "POST",
    query: {},
    body: {
      query: "query",
      filters: "filters",
      sections: "sections",
      limit: "limit",
      offset: "offset",
      sortBy: "sort_by",
      sortOrder: "sort_order",
    },
  },
  get_dataforseo_reference_data: { path: "/apis/v1/dataforseo", query: {} },
  get_ahrefs_domain_rating: {
    path: "/apis/v1/ahrefs/site-explorer/domain-rating",
    query: { target: "target", date: "date" },
  },
  get_ahrefs_site_metrics: {
    path: "/apis/v1/ahrefs/site-explorer/metrics",
    query: { target: "target", date: "date" },
  },
  ...Object.fromEntries(
    dataForSeoResearchContracts.map((contract) => [
      contract.name,
      {
        path: contract.path,
        method: "POST" as const,
        query: {},
        bodyArray: true,
        timeoutMs: contract.path.includes("/ai_optimization/llm_mentions/") ? 180000 : undefined,
        body: Object.fromEntries(
          Object.keys(contract.inputSchema.properties).map((key) => [key, camelToSnakeCase(key)]),
        ),
      },
    ]),
  ),
  ...Object.fromEntries(
    aisaFirecrawlFamilies.flatMap((family) => {
      const base = `/apis/v1/firecrawl/${family.path}`;
      return [
        [
          `submit_firecrawl_${family.name}`,
          {
            path: base,
            method: "POST",
            query: {},
            asyncJob: "submit",
            body: Object.fromEntries(
              Object.keys(readSchemaProperties(family.inputSchema))
                .filter((key) => key !== "maxPriceUsd")
                .map((key) => [key, key]),
            ),
          },
        ],
        [
          `get_firecrawl_${family.name}`,
          {
            path: `${base}/{taskId}`,
            query: {},
            pathParams: { taskId: "taskId" },
            asyncJob: "get",
          },
        ],
        [
          `cancel_firecrawl_${family.name}`,
          {
            path: `${base}/{taskId}/cancel`,
            method: "POST",
            query: {},
            pathParams: { taskId: "taskId" },
            asyncJob: "cancel",
          },
        ],
      ] as Array<[string, AisaActionRoute]>;
    }),
  ),
  search_exa: {
    path: "/apis/v1/exa/search",
    method: "POST",
    query: {},
    timeoutMs: 180000,
    body: {
      query: "query",
      stream: "stream",
      type: "type",
      numResults: "numResults",
      category: "category",
      includeDomains: "includeDomains",
      excludeDomains: "excludeDomains",
      startPublishedDate: "startPublishedDate",
      endPublishedDate: "endPublishedDate",
      contents: "contents",
      outputSchema: "outputSchema",
      systemPrompt: "systemPrompt",
    },
  },
  get_exa_contents: {
    path: "/apis/v1/exa/contents",
    method: "POST",
    query: {},
    timeoutMs: 180000,
    bodyDefaults: { text: true },
    body: {
      urls: "ids",
      stream: "stream",
      text: "text",
      highlights: "highlights",
      summary: "summary",
      livecrawl: "livecrawl",
      subpages: "subpages",
    },
  },
  answer_exa: {
    path: "/apis/v1/exa/answer",
    method: "POST",
    query: {},
    timeoutMs: 180000,
    body: {
      query: "query",
      type: "type",
      stream: "stream",
      text: "text",
      outputSchema: "outputSchema",
    },
  },
  scrape_firecrawl: {
    path: "/apis/v1/firecrawl/scrape",
    method: "POST",
    query: {},
    timeoutMs: 180000,
    body: { url: "url" },
    bodyDefaults: { proxy: "basic", formats: ["markdown"], onlyCleanContent: false },
  },
  map_firecrawl: {
    path: "/apis/v1/firecrawl/map",
    method: "POST",
    query: {},
    timeoutMs: 180000,
    body: { url: "url", limit: "limit" },
  },
  crawl_tavily: {
    path: "/apis/v1/tavily/crawl",
    method: "POST",
    query: {},
    timeoutMs: 180000,
    body: {
      url: "url",
      limit: "limit",
      maxDepth: "max_depth",
      maxBreadth: "max_breadth",
      instructions: "instructions",
      selectPaths: "select_paths",
      excludePaths: "exclude_paths",
      selectDomains: "select_domains",
      excludeDomains: "exclude_domains",
      allowExternal: "allow_external",
      chunksPerSource: "chunks_per_source",
      extractDepth: "extract_depth",
      format: "format",
      includeFavicon: "include_favicon",
      includeImages: "include_images",
      includeUsage: "include_usage",
      timeout: "timeout",
    },
  },
  extract_tavily: {
    path: "/apis/v1/tavily/extract",
    method: "POST",
    query: {},
    timeoutMs: 90000,
    body: {
      urls: "urls",
      query: "query",
      chunksPerSource: "chunks_per_source",
      extractDepth: "extract_depth",
      format: "format",
      includeFavicon: "include_favicon",
      includeImages: "include_images",
      includeUsage: "include_usage",
      timeout: "timeout",
    },
  },
  get_credits_balance: { path: "/v1/credits/balance", query: {} },
  get_usage: {
    path: "/v1/usage",
    query: { startTimestamp: "start_time", endTimestamp: "end_time" },
  },
  query_dataforseo_chatgpt: dataForSeoLlmRoute("/apis/v1/dataforseo/ai_optimization/chat_gpt/llm_responses/live"),
  query_dataforseo_claude: dataForSeoLlmRoute("/apis/v1/dataforseo/ai_optimization/claude/llm_responses/live"),
  query_dataforseo_gemini: dataForSeoLlmRoute("/apis/v1/dataforseo/ai_optimization/gemini/llm_responses/live"),
  query_dataforseo_perplexity: dataForSeoLlmRoute("/apis/v1/dataforseo/ai_optimization/perplexity/llm_responses/live"),
  get_dataforseo_keyword_trends: dataForSeoRoute("/apis/v1/dataforseo/keywords_data/dataforseo_trends/explore/live", {
    keywords: "keywords",
    locationName: "locationName",
    locationCode: "locationCode",
    type: "type",
    dateFrom: "dateFrom",
    dateTo: "dateTo",
    timeRange: "timeRange",
    tag: "tag",
  }),
  get_dataforseo_ai_keyword_volume: dataForSeoRoute(
    "/apis/v1/dataforseo/ai_optimization/ai_keyword_data/keywords_search_volume/live",
    {
      keywords: "keywords",
      locationName: "locationName",
      locationCode: "locationCode",
      languageName: "languageName",
      languageCode: "languageCode",
      tag: "tag",
    },
  ),
  get_crypto_prices: {
    path: "/apis/v1/coingecko/simple/price",
    query: {
      coinIds: "ids",
      currencies: "vs_currencies",
      includeMarketCap: "include_market_cap",
      include24HourVolume: "include_24hr_vol",
      include24HourChange: "include_24hr_change",
      includeLastUpdatedAt: "include_last_updated_at",
      precision: "precision",
      names: "names",
      symbols: "symbols",
      includeTokens: "include_tokens",
    },
    commaSeparated: ["coinIds", "currencies", "names", "symbols"],
  },
  list_crypto_markets: {
    path: "/apis/v1/coingecko/coins/markets",
    query: {
      currency: "vs_currency",
      coinIds: "ids",
      category: "category",
      order: "order",
      perPage: "per_page",
      page: "page",
      sparkline: "sparkline",
      priceChangePercentages: "price_change_percentage",
      names: "names",
      symbols: "symbols",
      includeTokens: "include_tokens",
      includeRehypothecated: "include_rehypothecated",
      locale: "locale",
      precision: "precision",
    },
    commaSeparated: ["coinIds", "priceChangePercentages", "names", "symbols"],
  },
  get_crypto_coin: {
    path: "/apis/v1/coingecko/coins/{coinId}",
    pathParams: {
      coinId: "coinId",
    },
    query: {
      localization: "localization",
      tickers: "tickers",
      marketData: "market_data",
      sparkline: "sparkline",
      dexPairFormat: "dex_pair_format",
      includeCategoriesDetails: "include_categories_details",
    },
  },
  get_crypto_market_chart: {
    path: "/apis/v1/coingecko/coins/{coinId}/market_chart/range",
    pathParams: {
      coinId: "coinId",
    },
    query: {
      currency: "vs_currency",
      fromTimestamp: "from",
      toTimestamp: "to",
      precision: "precision",
      interval: "interval",
    },
  },
  get_crypto_ohlc: {
    path: "/apis/v1/coingecko/coins/{coinId}/ohlc",
    pathParams: {
      coinId: "coinId",
    },
    query: {
      currency: "vs_currency",
      days: "days",
      precision: "precision",
      interval: "interval",
    },
  },
  get_token_prices: {
    path: "/apis/v1/coingecko/simple/token_price/{platformId}",
    pathParams: {
      platformId: "platformId",
    },
    query: {
      contractAddresses: "contract_addresses",
      currencies: "vs_currencies",
      includeMarketCap: "include_market_cap",
      include24HourVolume: "include_24hr_vol",
      include24HourChange: "include_24hr_change",
      includeLastUpdatedAt: "include_last_updated_at",
      precision: "precision",
    },
    commaSeparated: ["contractAddresses", "currencies"],
  },
  get_token_data: {
    path: "/apis/v1/coingecko/coins/{platformId}/contract/{contractAddress}",
    pathParams: { platformId: "platformId", contractAddress: "contractAddress" },
    query: {},
  },
  list_crypto_exchanges: {
    path: "/apis/v1/coingecko/exchanges",
    query: { perPage: "per_page", page: "page" },
  },
  list_crypto_categories: {
    path: "/apis/v1/coingecko/coins/categories",
    query: { order: "order" },
  },
  get_trending_crypto: {
    path: "/apis/v1/coingecko/search/trending",
    query: {
      showMax: "show_max",
    },
    commaSeparated: ["showMax"],
  },
  get_twitter_user: {
    path: "/apis/v1/twitter/user/info",
    query: { username: "userName" },
  },
  get_twitter_users: {
    path: "/apis/v1/twitter/user/batch_info_by_ids",
    query: { userIds: "userIds" },
    commaSeparated: ["userIds"],
  },
  search_twitter_posts: {
    path: "/apis/v1/twitter/tweet/advanced_search",
    query: { query: "query", resultType: "queryType", cursor: "cursor" },
  },
  get_twitter_posts: {
    path: "/apis/v1/twitter/tweets",
    query: { postIds: "tweet_ids" },
    commaSeparated: ["postIds"],
  },
  get_twitter_user_timeline: {
    path: "/apis/v1/twitter/user/tweet_timeline",
    query: {
      userId: "userId",
      includeReplies: "includeReplies",
      includeParentPost: "includeParentTweet",
      cursor: "cursor",
    },
  },
  get_twitter_user_recent_posts: {
    path: "/apis/v1/twitter/user/last_tweets",
    query: {
      userId: "userId",
      username: "userName",
      includeReplies: "includeReplies",
      cursor: "cursor",
    },
  },
  get_twitter_mentions: {
    path: "/apis/v1/twitter/user/mentions",
    query: {
      username: "userName",
      sinceTimestamp: "sinceTime",
      untilTimestamp: "untilTime",
      cursor: "cursor",
    },
  },
  get_twitter_post_replies: {
    path: "/apis/v1/twitter/tweet/replies",
    query: { postId: "tweetId", cursor: "cursor" },
  },
  get_twitter_thread: {
    path: "/apis/v1/twitter/tweet/thread_context",
    query: { postId: "tweetId", cursor: "cursor" },
  },
  get_twitter_trends: {
    path: "/apis/v1/twitter/trends",
    query: { woeid: "woeid", count: "count" },
  },
  enrich_apollo_person: {
    path: "/apis/v1/apollo/people/match",
    method: "POST",
    query: {},
    body: {
      firstName: "first_name",
      lastName: "last_name",
      name: "name",
      email: "email",
      hashedEmail: "hashed_email",
      organizationName: "organization_name",
      domain: "domain",
      personId: "id",
      linkedinUrl: "linkedin_url",
    },
  },
  enrich_apollo_people: {
    path: "/apis/v1/apollo/people/bulk_match",
    method: "POST",
    query: {},
    body: { people: "details" },
    snakeCaseBody: true,
    bodyKeyAliases: { personId: "id" },
  },
  enrich_apollo_organization: {
    path: "/apis/v1/apollo/organizations/enrich",
    query: { domain: "domain" },
  },
  enrich_apollo_organizations: {
    path: "/apis/v1/apollo/organizations/bulk_enrich",
    method: "POST",
    query: { domains: "domains[]" },
  },
  search_apollo_people: {
    path: "/apis/v1/apollo/mixed_people/api_search",
    method: "POST",
    query: {
      titles: "person_titles[]",
      includeSimilarTitles: "include_similar_titles",
      keywords: "q_keywords",
      personLocations: "person_locations[]",
      seniorities: "person_seniorities[]",
      organizationLocations: "organization_locations[]",
      organizationDomains: "q_organization_domains_list[]",
      organizationIds: "organization_ids[]",
      employeeRanges: "organization_num_employees_ranges[]",
      page: "page",
      perPage: "per_page",
      contactEmailStatus: "contact_email_status[]",
      currentlyNotUsingAnyOfTechnologyUids: "currently_not_using_any_of_technology_uids[]",
      currentlyUsingAllOfTechnologyUids: "currently_using_all_of_technology_uids[]",
      currentlyUsingAnyOfTechnologyUids: "currently_using_any_of_technology_uids[]",
      organizationJobLocations: "organization_job_locations[]",
      organizationJobPostedAtRangeMax: "organization_job_posted_at_range[max]",
      organizationJobPostedAtRangeMin: "organization_job_posted_at_range[min]",
      organizationNumJobsRangeMax: "organization_num_jobs_range[max]",
      organizationNumJobsRangeMin: "organization_num_jobs_range[min]",
      qOrganizationJobTitles: "q_organization_job_titles[]",
      revenueRangeMax: "revenue_range[max]",
      revenueRangeMin: "revenue_range[min]",
    },
  },
  search_apollo_organizations: {
    path: "/apis/v1/apollo/mixed_companies/search",
    method: "POST",
    query: {
      domains: "q_organization_domains_list[]",
      employeeRanges: "organization_num_employees_ranges[]",
      locations: "organization_locations[]",
      excludedLocations: "organization_not_locations[]",
      name: "q_organization_name",
      organizationIds: "organization_ids[]",
      page: "page",
      perPage: "per_page",
      currentlyUsingAnyOfTechnologyUids: "currently_using_any_of_technology_uids[]",
      latestFundingAmountRangeMax: "latest_funding_amount_range[max]",
      latestFundingAmountRangeMin: "latest_funding_amount_range[min]",
      latestFundingDateRangeMax: "latest_funding_date_range[max]",
      latestFundingDateRangeMin: "latest_funding_date_range[min]",
      organizationJobLocations: "organization_job_locations[]",
      organizationJobPostedAtRangeMax: "organization_job_posted_at_range[max]",
      organizationJobPostedAtRangeMin: "organization_job_posted_at_range[min]",
      organizationNumJobsRangeMax: "organization_num_jobs_range[max]",
      organizationNumJobsRangeMin: "organization_num_jobs_range[min]",
      qOrganizationJobTitles: "q_organization_job_titles[]",
      qOrganizationKeywordTags: "q_organization_keyword_tags[]",
      revenueRangeMax: "revenue_range[max]",
      revenueRangeMin: "revenue_range[min]",
      totalFundingRangeMax: "total_funding_range[max]",
      totalFundingRangeMin: "total_funding_range[min]",
    },
  },
  get_apollo_organization: {
    path: "/apis/v1/apollo/organizations/{organizationId}",
    pathParams: { organizationId: "organizationId" },
    query: {},
  },
  get_apollo_job_postings: {
    path: "/apis/v1/apollo/organizations/{organizationId}/job_postings",
    pathParams: { organizationId: "organizationId" },
    query: { page: "page", perPage: "per_page" },
  },
  search_apollo_company_news: {
    path: "/apis/v1/apollo/news_articles/search",
    method: "POST",
    query: {
      organizationIds: "organization_ids[]",
      categories: "categories[]",
      publishedFrom: "published_at[min]",
      publishedTo: "published_at[max]",
      page: "page",
      perPage: "per_page",
    },
  },
  get_similarweb_traffic_engagement: {
    path: "/apis/v1/similarweb/website/traffic-engagement",
    query: {
      domain: "domain",
      ...similarwebMonthQuery,
      metrics: "metrics",
      monthToDate: "mtd",
    },
  },
  get_similarweb_ranking: {
    path: "/apis/v1/similarweb/website/ranking",
    query: { domain: "domain", ...similarwebMonthQuery },
  },
  get_similarweb_ppc_spend: {
    path: "/apis/v1/similarweb/website/ppc-spend",
    query: { domain: "domain", ...similarwebMonthQuery },
  },
  get_similarweb_top_sites: {
    path: "/apis/v1/similarweb/website/top-sites-ranking",
    query: { category: "category", limit: "limit", country: "country", offset: "offset" },
  },
  get_similarweb_marketing_channels: {
    path: "/apis/v1/similarweb/website/marketing-channel-sources-legacy",
    query: { domain: "domain", ...similarwebMonthQuery },
  },
  get_similarweb_referrals: {
    path: "/apis/v1/similarweb/website/referrals",
    query: similarwebRowsQuery,
  },
  get_similarweb_ad_networks: {
    path: "/apis/v1/similarweb/website/ad-networks",
    query: similarwebRowsQuery,
  },
  get_similarweb_similar_sites: {
    path: "/apis/v1/similarweb/website/similar-sites",
    query: similarwebRowsQuery,
  },
  get_similarweb_demographics: {
    path: "/apis/v1/similarweb/website/demographics",
    query: {
      domain: "domain",
      month: ["start_date", "end_date"],
      country: "country",
      mainDomainOnly: "main_domain_only",
    },
    fixedQuery: { granularity: "monthly" },
  },
  get_similarweb_deduplicated_audience: {
    path: "/apis/v1/similarweb/website/deduplicated-audience",
    query: { domain: "domain", ...similarwebMonthQuery },
  },
  get_similarweb_audience_interests: {
    path: "/apis/v1/similarweb/website/audience-interest",
    query: similarwebRowsQuery,
  },
  get_similarweb_audience_overlap: {
    path: "/apis/v1/similarweb/website/audience-overlap",
    query: {
      domains: "domains",
      startMonth: "start_date",
      endMonth: "end_date",
      country: "country",
    },
    commaSeparated: ["domains"],
  },
  get_similarweb_technologies: {
    path: "/apis/v1/similarweb/website/technologies",
    query: {
      domain: "domain",
      month: ["start_date", "end_date"],
      limit: "limit",
      country: "country",
      mainDomainOnly: "main_domain_only",
    },
    fixedQuery: { granularity: "monthly" },
  },
  get_similarweb_popular_pages: {
    path: "/apis/v1/similarweb/website/popular-pages",
    query: similarwebRowsQuery,
  },
  get_similarweb_subdomains: {
    path: "/apis/v1/similarweb/website/subdomains",
    query: similarwebRowsQuery,
  },
  get_similarweb_keyword_competitors: {
    path: "/apis/v1/similarweb/search/keyword-competitors",
    query: similarwebRowsQuery,
  },
  get_similarweb_website_keywords: {
    path: "/apis/v1/similarweb/search/website-keywords",
    query: similarwebRowsQuery,
    fixedQuery: { granularity: "monthly" },
  },
  get_similarweb_serp_players_timeseries: {
    path: "/apis/v1/similarweb/search/serp-players-timeseries",
    query: {
      keyword: "keyword",
      startMonth: "start_date",
      endMonth: "end_date",
      limit: "limit",
      country: "country",
      offset: "offset",
    },
  },
  get_similarweb_serp_players_aggregated: {
    path: "/apis/v1/similarweb/search/serp-players-aggregated",
    query: {
      keyword: "keyword",
      startMonth: "start_date",
      endMonth: "end_date",
      limit: "limit",
      country: "country",
      offset: "offset",
    },
  },
  get_similarweb_landing_pages: {
    path: "/apis/v1/similarweb/search/landing-pages",
    query: similarwebRowsQuery,
  },
  get_similarweb_traffic_snapshot: {
    path: "/apis/v1/similarweb/website-traffic-snapshot",
    query: { domain: "domain", country: "country" },
  },
  get_similarweb_traffic_trend: {
    path: "/apis/v1/similarweb/website-traffic-trend",
    query: { domain: "domain", country: "country" },
  },
  get_similarweb_top_geographies: {
    path: "/apis/v1/similarweb/website-top-geographies",
    query: { domain: "domain" },
  },
  search_foreplay_ads: {
    path: "/apis/v1/foreplay/discovery/ads",
    query: {
      query: "query",
      live: "live",
      displayFormats: "display_format",
      publisherPlatforms: "publisher_platform",
      niches: "niches",
      marketTarget: "market_target",
      languages: "languages",
      minVideoDurationSeconds: "video_duration_min",
      maxVideoDurationSeconds: "video_duration_max",
      minRunningDays: "running_duration_min_days",
      maxRunningDays: "running_duration_max_days",
      startDate: "start_date",
      endDate: "end_date",
      cursor: "cursor",
      limit: "limit",
      order: "order",
    },
  },
  get_foreplay_brand_ads: {
    path: "/apis/v1/foreplay/brand/getAdsByBrandId",
    query: {
      brandIds: "brand_ids",
      live: "live",
      displayFormats: "display_format",
      publisherPlatforms: "publisher_platform",
      niches: "niches",
      marketTarget: "market_target",
      languages: "languages",
      minVideoDurationSeconds: "video_duration_min",
      maxVideoDurationSeconds: "video_duration_max",
      minRunningDays: "running_duration_min_days",
      maxRunningDays: "running_duration_max_days",
      startDate: "start_date",
      endDate: "end_date",
      cursor: "cursor",
      limit: "limit",
      order: "order",
      collect: "collect",
    },
    commaSeparated: ["brandIds"],
  },
  find_foreplay_brands: {
    path: "/apis/v1/foreplay/brand/getBrandsByDomain",
    query: { domain: "domain", limit: "limit", order: "order" },
  },
  get_foreplay_brand_analytics: {
    path: "/apis/v1/foreplay/brand/analytics",
    query: {
      adLibraryId: "id",
      startDate: "start_date",
      endDate: "end_date",
      order: "order",
    },
  },
  find_similar_creators: {
    path: "/apis/v1/waveinflu/similar",
    method: "POST",
    query: {},
    body: {
      platform: "platform",
      targetAccount: "target_account",
      limit: "limit",
      filters: "filters",
    },
  },
  search_creators: {
    path: "/apis/v1/waveinflu/ai-search",
    method: "POST",
    query: {},
    body: { platform: "platform", query: "query", limit: "limit", filters: "filters" },
  },
  lookup_creator_email: {
    path: "/apis/v1/waveinflu/email-lookup",
    method: "POST",
    query: {},
    body: { profileUrl: "profile_url" },
  },
  get_semrush_domain_overview: {
    path: "/apis/v1/semrush/domain-overview",
    query: { domain: "domain", database: "database" },
    response: {
      type: "semicolon",
      header: "optional",
      columns: ["Database", "Domain", "Rank", "OrganicKeywords", "OrganicTraffic", "OrganicCost", "AdwordsKeywords"],
    },
  },
  get_semrush_organic_results: {
    path: "/apis/v1/semrush/keyword-organic-results",
    query: { phrase: "phrase", database: "database" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_domain_organic_keywords: {
    path: "/apis/v1/semrush/domain-organic-keywords",
    query: { domain: "domain", database: "database" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_organic_competitors: {
    path: "/apis/v1/semrush/domain-organic-competitors",
    query: { domain: "domain", database: "database" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_url_organic_keywords: {
    path: "/apis/v1/semrush/url-organic-keywords",
    query: { url: "url", database: "database" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_backlink_anchors: {
    path: "/apis/v1/semrush/backlink-anchors",
    query: { target: "target", targetType: "target_type" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_indexed_pages: {
    path: "/apis/v1/semrush/indexed-pages",
    query: { target: "target", targetType: "target_type" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_keyword_overview: {
    path: "/apis/v1/semrush/keyword-overview",
    query: { phrase: "phrase", database: "database" },
    response: {
      type: "semicolon",
      header: "optional",
      columns: ["Keyword", "SearchVolume", "CPC", "Competition", "NumberOfResults"],
    },
    omitQueryDefaults: { database: "us" },
  },
  get_semrush_keyword_difficulty: {
    path: "/apis/v1/semrush/keyword-difficulty",
    query: { phrases: "phrase", database: "database" },
    joined: { phrases: ";" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_broad_match_keywords: {
    path: "/apis/v1/semrush/broad-match-keywords",
    query: { phrase: "phrase", database: "database" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_question_keywords: {
    path: "/apis/v1/semrush/question-keywords",
    query: { phrase: "phrase", database: "database" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_domain_rank_history: {
    path: "/apis/v1/semrush/domain-rank-history",
    query: { domain: "domain", database: "database" },
    response: { type: "semicolon", header: "required" },
  },
  compare_semrush_domains: {
    path: "/apis/v1/semrush/domain-vs-domain",
    query: { comparison: "domains", database: "database" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_backlinks_overview: {
    path: "/apis/v1/semrush/backlinks-overview",
    query: { target: "target" },
    response: {
      type: "semicolon",
      header: "optional",
      columns: ["ascore", "total_backlinks", "referring_domains", "referring_urls", "referring_ips"],
      headerAliases: [["ascore", "total", "domains_num", "urls_num", "ips_num"]],
    },
  },
  get_semrush_backlinks: {
    path: "/apis/v1/semrush/backlinks",
    query: { target: "target", targetType: "target_type" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_referring_domains: {
    path: "/apis/v1/semrush/referring-domains",
    query: { target: "target", targetType: "target_type" },
    response: { type: "semicolon", header: "required" },
  },
  get_semrush_backlink_competitors: {
    path: "/apis/v1/semrush/backlink-competitors",
    query: { target: "target", targetType: "target_type" },
    response: { type: "semicolon", header: "required" },
  },
  get_stock_price_snapshot: {
    path: "/apis/v1/financial/prices/snapshot",
    query: { ticker: "ticker" },
  },
  get_stock_prices: {
    path: "/apis/v1/financial/prices",
    query: {
      cursor: "cursor",
      endDate: "end_date",
      interval: "interval",
      intervalMultiplier: "interval_multiplier",
      startDate: "start_date",
      ticker: "ticker",
    },
  },
  get_company_facts: {
    path: "/apis/v1/financial/company/facts",
    query: { ticker: "ticker", cik: "cik" },
  },
  get_income_statements: {
    path: "/apis/v1/financial/financials/income-statements",
    query: {
      cik: "cik",
      cursor: "cursor",
      exchange: "exchange",
      filingDate: "filing_date",
      filingDateGt: "filing_date_gt",
      filingDateGte: "filing_date_gte",
      filingDateLt: "filing_date_lt",
      filingDateLte: "filing_date_lte",
      isin: "isin",
      limit: "limit",
      market: "market",
      period: "period",
      reportPeriod: "report_period",
      reportPeriodGt: "report_period_gt",
      reportPeriodGte: "report_period_gte",
      reportPeriodLt: "report_period_lt",
      reportPeriodLte: "report_period_lte",
      ticker: "ticker",
    },
  },
  get_balance_sheets: {
    path: "/apis/v1/financial/financials/balance-sheets",
    query: {
      cik: "cik",
      cursor: "cursor",
      exchange: "exchange",
      filingDate: "filing_date",
      filingDateGt: "filing_date_gt",
      filingDateGte: "filing_date_gte",
      filingDateLt: "filing_date_lt",
      filingDateLte: "filing_date_lte",
      isin: "isin",
      limit: "limit",
      market: "market",
      period: "period",
      reportPeriod: "report_period",
      reportPeriodGt: "report_period_gt",
      reportPeriodGte: "report_period_gte",
      reportPeriodLt: "report_period_lt",
      reportPeriodLte: "report_period_lte",
      ticker: "ticker",
    },
  },
  get_cash_flow_statements: {
    path: "/apis/v1/financial/financials/cash-flow-statements",
    query: {
      cik: "cik",
      cursor: "cursor",
      exchange: "exchange",
      filingDate: "filing_date",
      filingDateGt: "filing_date_gt",
      filingDateGte: "filing_date_gte",
      filingDateLt: "filing_date_lt",
      filingDateLte: "filing_date_lte",
      isin: "isin",
      limit: "limit",
      period: "period",
      reportPeriod: "report_period",
      reportPeriodGt: "report_period_gt",
      reportPeriodGte: "report_period_gte",
      reportPeriodLt: "report_period_lt",
      reportPeriodLte: "report_period_lte",
      ticker: "ticker",
    },
  },
  get_financial_metrics: {
    path: "/apis/v1/financial/financial-metrics",
    query: {
      cik: "cik",
      cursor: "cursor",
      exchange: "exchange",
      filingDate: "filing_date",
      filingDateGt: "filing_date_gt",
      filingDateGte: "filing_date_gte",
      filingDateLt: "filing_date_lt",
      filingDateLte: "filing_date_lte",
      isin: "isin",
      limit: "limit",
      period: "period",
      reportPeriod: "report_period",
      reportPeriodGt: "report_period_gt",
      reportPeriodGte: "report_period_gte",
      reportPeriodLt: "report_period_lt",
      reportPeriodLte: "report_period_lte",
      ticker: "ticker",
    },
  },
  get_financial_metrics_snapshot: {
    path: "/apis/v1/financial/financial-metrics/snapshot",
    query: {
      cik: "cik",
      exchange: "exchange",
      isin: "isin",
      market: "market",
      ticker: "ticker",
    },
  },
  get_stock_earnings: {
    path: "/apis/v1/financial/earnings",
    query: {
      cursor: "cursor",
      limit: "limit",
      ticker: "ticker",
    },
  },
  get_analyst_estimates: {
    path: "/apis/v1/financial/analyst-estimates",
    query: { ticker: "ticker", period: "period", limit: "limit" },
  },
  get_insider_trades: {
    path: "/apis/v1/financial/insider-trades",
    query: {
      cursor: "cursor",
      filingDate: "filing_date",
      filingDateGt: "filing_date_gt",
      filingDateFrom: "filing_date_gte",
      filingDateLt: "filing_date_lt",
      filingDateTo: "filing_date_lte",
      formType: "form_type",
      limit: "limit",
      insiderName: "name",
      ticker: "ticker",
      transactionType: "transaction_type",
    },
  },
  get_company_news: {
    path: "/apis/v1/financial/news",
    query: {
      cursor: "cursor",
      limit: "limit",
      ticker: "ticker",
    },
  },
  list_company_filings: {
    path: "/apis/v1/financial/filings",
    query: {
      cik: "cik",
      cursor: "cursor",
      filingType: "filing_type",
      limit: "limit",
      ticker: "ticker",
    },
  },
  get_filing_items: {
    path: "/apis/v1/financial/filings/items",
    query: {
      ticker: "ticker",
      filingType: "filing_type",
      year: "year",
      quarter: "quarter",
      item: "item",
      accessionNumber: "accession_number",
      includeExhibits: "include_exhibits",
    },
  },
  get_kalshi_markets: {
    path: "/apis/v1/kalshi/markets",
    query: {
      tickers: "tickers",
      eventTicker: "event_ticker",
      seriesTicker: "series_ticker",
      search: "search",
      status: "status",
      limit: "limit",
      cursor: "cursor",
      minCreatedTimestamp: "min_created_ts",
      maxCreatedTimestamp: "max_created_ts",
      minUpdatedTimestamp: "min_updated_ts",
      minCloseTimestamp: "min_close_ts",
      maxCloseTimestamp: "max_close_ts",
      minSettledTimestamp: "min_settled_ts",
      maxSettledTimestamp: "max_settled_ts",
      multivariateEventFilter: "mve_filter",
    },
  },
  get_kalshi_trades: {
    path: "/apis/v1/kalshi/trades",
    query: {
      limit: "limit",
      cursor: "cursor",
      ticker: "ticker",
      minTimestamp: "min_ts",
      maxTimestamp: "max_ts",
      isBlockTrade: "is_block_trade",
    },
  },
  get_polymarket_markets: {
    path: "/apis/v1/polymarket/markets",
    query: {
      limit: "limit",
      offset: "offset",
      order: "order",
      ascending: "ascending",
      ids: "id",
      slugs: "slug",
      clobTokenIds: "clob_token_ids",
      conditionIds: "condition_ids",
      minVolume: "volume_num_min",
      maxVolume: "volume_num_max",
      minStartDate: "start_date_min",
      maxStartDate: "start_date_max",
      minEndDate: "end_date_min",
      maxEndDate: "end_date_max",
      tagId: "tag_id",
      closed: "closed",
      includeTag: "include_tag",
    },
  },
  get_polymarket_events: {
    path: "/apis/v1/polymarket/events",
    query: {
      limit: "limit",
      offset: "offset",
      order: "order",
      ascending: "ascending",
      ids: "id",
      slugs: "slug",
      tagId: "tag_id",
      tagSlug: "tag_slug",
      active: "active",
      archived: "archived",
      featured: "featured",
      closed: "closed",
      minLiquidity: "liquidity_min",
      maxLiquidity: "liquidity_max",
      minVolume: "volume_min",
      maxVolume: "volume_max",
      minStartDate: "start_date_min",
      maxStartDate: "start_date_max",
      minEndDate: "end_date_min",
      maxEndDate: "end_date_max",
    },
  },
};

export function buildAisaPath(
  path: string,
  input: Record<string, unknown>,
  pathParams: Record<string, string> | undefined,
): string {
  let resolved = path;
  for (const [placeholder, inputName] of Object.entries(pathParams ?? {})) {
    const value = String(input[inputName]);
    if (value === "" || value === "." || value === "..") {
      throw new ProviderRequestError(400, `${inputName} is not a valid path segment`, undefined, "invalid_input");
    }

    resolved = resolved.replace(`{${placeholder}}`, encodeURIComponent(value));
  }

  return resolved;
}

export function buildAisaBody(input: Record<string, unknown>, route: AisaActionRoute): unknown {
  if (route.bodyInput) {
    const body = input[route.bodyInput];
    return route.snakeCaseBody ? toSnakeCaseJson(body, route.bodyKeyAliases) : body;
  }

  if (!route.body) {
    return undefined;
  }

  const body = {
    ...route.bodyDefaults,
    ...Object.fromEntries(
      Object.entries(route.body)
        .filter(([inputName]) => input[inputName] !== undefined)
        .map(([inputName, bodyName]) => [bodyName, input[inputName]]),
    ),
  };
  const normalized = route.snakeCaseBody ? toSnakeCaseJson(body, route.bodyKeyAliases) : body;
  return route.bodyArray ? [normalized] : normalized;
}

function toSnakeCaseJson(value: unknown, keyAliases: Record<string, string> = {}): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toSnakeCaseJson(item, keyAliases));
  }

  const object = optionalRecord(value);
  if (!object) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [
      keyAliases[key] ?? camelToSnakeCase(key),
      toSnakeCaseJson(child, keyAliases),
    ]),
  );
}

function camelToSnakeCase(value: string) {
  let output = "";
  for (const character of value) {
    const lower = character.toLowerCase();
    output += character === lower ? character : `_${lower}`;
  }

  return output;
}

export function buildAisaQuery(
  input: Record<string, unknown>,
  mapping: Record<string, string | readonly string[]>,
  commaSeparated: readonly string[],
  joined: Record<string, string>,
  fixed: Record<string, string>,
  omitDefaults: Record<string, unknown>,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(fixed)) {
    query.set(name, value);
  }

  for (const [inputName, queryName] of Object.entries(mapping)) {
    const value = input[inputName];
    if (value == null || value === omitDefaults[inputName]) {
      continue;
    }

    const queryNames = typeof queryName === "string" ? [queryName] : queryName;
    if (Array.isArray(value)) {
      const separator = joined[inputName];
      if (separator) {
        for (const name of queryNames) {
          query.set(name, value.join(separator));
        }

        continue;
      }

      if (commaSeparated.includes(inputName)) {
        for (const name of queryNames) {
          query.set(name, value.join(","));
        }

        continue;
      }

      for (const item of value) {
        for (const name of queryNames) {
          query.append(name, String(item));
        }
      }

      continue;
    }

    for (const name of queryNames) {
      query.set(name, String(value));
    }
  }

  return query;
}
