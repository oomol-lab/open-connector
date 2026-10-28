import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { readSchemaProperties } from "../../core/json-schema.ts";
import { randomUUIDv7 } from "../../core/uuid-v7.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredResponseRecord } from "../provider-runtime.ts";
import { providerInputError, ProviderRequestError, runProviderRequest } from "../provider-runtime.ts";
import { dataForSeoReferencePaths } from "./dataforseo-reference-actions.ts";
import { dataForSeoResearchContracts } from "./dataforseo-research-actions.ts";
import { aisaFirecrawlFamilies } from "./firecrawl-actions.ts";

const service = "aisa";

const aisaApiOrigin = "https://api.aisa.one";
interface AisaActionRoute {
  path: string;
  method?: "GET" | "POST";
  query: Record<string, string | readonly string[]>;
  commaSeparated?: readonly string[];
  joined?: Record<string, string>;
  body?: Record<string, string>;
  bodyArray?: boolean;
  snakeCaseBody?: boolean;
  bodyKeyAliases?: Record<string, string>;
  pathParams?: Record<string, string>;
  fixedQuery?: Record<string, string>;
  omitQueryDefaults?: Record<string, unknown>;
  response?: AisaResponseFormat;
  bodyDefaults?: Record<string, unknown>;
  timeoutMs?: number;
  asyncJob?: "submit" | "get" | "cancel";
}

interface AisaSemicolonResponse {
  type: "semicolon";
  header: "required" | "optional";
  columns?: readonly string[];
  headerAliases?: readonly (readonly string[])[];
}

type AisaResponseFormat = AisaSemicolonResponse;

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

function dataForSeoMentionRoute(path: string): AisaActionRoute {
  return dataForSeoRoute(path, {
    targets: "target",
    locationName: "locationName",
    locationCode: "locationCode",
    languageName: "languageName",
    languageCode: "languageCode",
    platform: "platform",
    linksScope: "linksScope",
    limit: "limit",
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

const aisaActionRoutes: Record<string, AisaActionRoute> = {
  search_firecrawl: {
    path: "/apis/v1/firecrawl/search",
    method: "POST",
    query: {},
    body: { query: "query", limit: "limit" },
    bodyDefaults: { enterprise: false, sources: ["web"] },
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
  get_dataforseo_llm_mention_metrics: dataForSeoMentionRoute(
    "/apis/v1/dataforseo/ai_optimization/llm_mentions/aggregated_metrics/live",
  ),
  search_dataforseo_llm_mentions: dataForSeoMentionRoute(
    "/apis/v1/dataforseo/ai_optimization/llm_mentions/search/live",
  ),
  get_dataforseo_llm_mention_top_domains: dataForSeoMentionRoute(
    "/apis/v1/dataforseo/ai_optimization/llm_mentions/top_domains/live",
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
    },
    commaSeparated: ["coinIds", "currencies"],
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
    },
    commaSeparated: ["coinIds", "priceChangePercentages"],
  },
  get_crypto_coin: {
    path: "/apis/v1/coingecko/coins/{coinId}",
    pathParams: { coinId: "coinId" },
    query: {
      localization: "localization",
      tickers: "tickers",
      marketData: "market_data",
      communityData: "community_data",
      developerData: "developer_data",
      sparkline: "sparkline",
    },
  },
  get_crypto_market_chart: {
    path: "/apis/v1/coingecko/coins/{coinId}/market_chart/range",
    pathParams: { coinId: "coinId" },
    query: {
      currency: "vs_currency",
      fromTimestamp: "from",
      toTimestamp: "to",
      precision: "precision",
    },
  },
  get_crypto_ohlc: {
    path: "/apis/v1/coingecko/coins/{coinId}/ohlc",
    pathParams: { coinId: "coinId" },
    query: { currency: "vs_currency", days: "days", precision: "precision" },
  },
  get_token_prices: {
    path: "/apis/v1/coingecko/simple/token_price/{platformId}",
    pathParams: { platformId: "platformId" },
    query: { contractAddresses: "contract_addresses", currencies: "vs_currencies" },
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
  get_crypto_news: {
    path: "/apis/v1/coingecko/news",
    query: {
      coinId: "coin_id",
      language: "language",
      articleType: "type",
      page: "page",
      perPage: "per_page",
    },
  },
  get_trending_crypto: {
    path: "/apis/v1/coingecko/search/trending",
    query: {},
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
    query: { ticker: "ticker", interval: "interval", startDate: "start_date", endDate: "end_date" },
  },
  get_company_facts: {
    path: "/apis/v1/financial/company/facts",
    query: { ticker: "ticker", cik: "cik" },
  },
  get_income_statements: {
    path: "/apis/v1/financial/financials/income-statements",
    query: { ticker: "ticker", cik: "cik", period: "period", limit: "limit" },
  },
  get_balance_sheets: {
    path: "/apis/v1/financial/financials/balance-sheets",
    query: { ticker: "ticker", cik: "cik", period: "period", limit: "limit" },
  },
  get_cash_flow_statements: {
    path: "/apis/v1/financial/financials/cash-flow-statements",
    query: { ticker: "ticker", cik: "cik", period: "period", limit: "limit" },
  },
  get_financial_metrics: {
    path: "/apis/v1/financial/financial-metrics",
    query: { ticker: "ticker", cik: "cik", period: "period", limit: "limit" },
  },
  get_financial_metrics_snapshot: {
    path: "/apis/v1/financial/financial-metrics/snapshot",
    query: { ticker: "ticker", cik: "cik" },
  },
  get_stock_earnings: {
    path: "/apis/v1/financial/earnings",
    query: { ticker: "ticker" },
  },
  get_analyst_estimates: {
    path: "/apis/v1/financial/analyst-estimates",
    query: { ticker: "ticker", period: "period", limit: "limit" },
  },
  get_insider_trades: {
    path: "/apis/v1/financial/insider-trades",
    query: {
      ticker: "ticker",
      limit: "limit",
      insiderName: "name",
      transactionType: "transaction_type",
      filingDate: "filing_date",
      filingDateFrom: "filing_date_gte",
      filingDateTo: "filing_date_lte",
    },
  },
  get_company_news: {
    path: "/apis/v1/financial/news",
    query: { ticker: "ticker", limit: "limit" },
  },
  list_company_filings: {
    path: "/apis/v1/financial/filings",
    query: { ticker: "ticker", cik: "cik", filingType: "filing_type", limit: "limit" },
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
  get_polymarket_activity: {
    path: "/apis/v1/polymarket/activity",
    query: {
      user: "user",
      startTimestamp: "start_time",
      endTimestamp: "end_time",
      marketSlug: "market_slug",
      conditionId: "condition_id",
      limit: "limit",
      paginationKey: "pagination_key",
    },
  },
};

function buildAisaPath(path: string, input: Record<string, unknown>, pathParams: Record<string, string> | undefined) {
  let resolved = path;
  for (const [placeholder, inputName] of Object.entries(pathParams ?? {})) {
    const value = String(input[inputName]);
    if (value === "" || value === "." || value === "..") {
      throw providerInputError(`${inputName} is not a valid path segment`);
    }
    resolved = resolved.replace(`{${placeholder}}`, encodeURIComponent(value));
  }
  return resolved;
}

function buildAisaBody(input: Record<string, unknown>, route: AisaActionRoute) {
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

function buildAisaQuery(
  input: Record<string, unknown>,
  mapping: Record<string, string | readonly string[]>,
  commaSeparated: readonly string[],
  joined: Record<string, string>,
  fixed: Record<string, string>,
  omitDefaults: Record<string, unknown>,
) {
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

type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: Record<string, Handler> = Object.fromEntries(
  Object.entries(aisaActionRoutes).map(([name, route]) => [
    name,
    async (input, context) => {
      const normalized = normalizeFirecrawlInput(name, input);
      const headers: Record<string, string> = {};
      if (route.asyncJob === "submit") {
        headers["Idempotency-Key"] = randomUUIDv7();
        const maxPriceUsd = optionalString(normalized.maxPriceUsd);
        if (maxPriceUsd !== undefined) headers["X-AISA-Max-Price-USD"] = maxPriceUsd;
      }
      const payload = await requestAisa(
        buildAisaPath(
          name === "get_dataforseo_reference_data"
            ? `${route.path}/${dataForSeoReferencePaths[String(normalized.resource)]}`
            : route.path,
          normalized,
          route.pathParams,
        ),
        buildAisaQuery(
          normalized,
          route.query,
          route.commaSeparated ?? [],
          route.joined ?? {},
          route.fixedQuery ?? {},
          route.omitQueryDefaults ?? {},
        ),
        context,
        route.method ?? "GET",
        buildAisaBody(normalized, route),
        "execute",
        route.response,
        route.timeoutMs,
        headers,
      );
      if (!route.asyncJob) return payload;
      const job = requiredResponseRecord(payload, "AIsa job");
      const id = optionalString(job.id);
      if (!id || (route.asyncJob !== "submit" && !optionalString(job.status)))
        throw new ProviderRequestError(502, "AIsa returned an invalid job handle or state");
      if (route.asyncJob !== "submit" && id !== normalized.taskId)
        throw new ProviderRequestError(502, "AIsa returned a different job");
      if (route.asyncJob === "submit") return { taskId: id };
      const { id: _id, object: _object, ...result } = job;
      return { ...result, taskId: id };
    },
  ]),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: aisaApiOrigin,
  auth: { type: "bearer" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json, text/plain;q=0.9, */*;q=0.8");
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = optionalRecord(
      await requestAisa(
        "/v1/credits/balance",
        new URLSearchParams(),
        { apiKey: input.apiKey, fetcher, signal },
        "GET",
        undefined,
        "validate",
      ),
    );
    if (!payload) throw new ProviderRequestError(502, "AIsa balance response must be an object");
    return {
      profile: { accountId: "api_key", displayName: "AIsa API Key" },
      grantedScopes: [],
      metadata: { apiOrigin: aisaApiOrigin },
    };
  },
};

async function requestAisa(
  path: string,
  query: URLSearchParams,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  method: "GET" | "POST",
  body: unknown,
  phase: "validate" | "execute" = "execute",
  responseFormat?: AisaResponseFormat,
  timeoutMs?: number,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "AIsa", timeoutMs }, async (signal) => {
    const url = new URL(path, aisaApiOrigin);
    url.search = query.toString();
    const headers = new Headers({
      ...extraHeaders,
      accept: responseFormat ? "text/plain, application/json;q=0.9" : "application/json",
      authorization: `Bearer ${context.apiKey}`,
    });
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await context.fetcher(url, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await readAisaPayload(response, responseFormat);
    if (!response.ok) throw createAisaError(response, payload, phase);
    return payload;
  });
}

async function readAisaPayload(response: Response, responseFormat: AisaResponseFormat | undefined) {
  const text = await response.text();
  if (text.trim() === "") {
    return response.ok && responseFormat?.type === "semicolon" ? createSemicolonOutput(text, responseFormat) : null;
  }
  if (response.ok && responseFormat?.type === "semicolon") {
    return createSemicolonOutput(text, responseFormat);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "AIsa returned invalid JSON");
  }
}

function createSemicolonOutput(rawText: string, responseFormat: AisaSemicolonResponse) {
  const records = isEmptySemrushReport(rawText) ? [] : parseSemicolonRecords(rawText);
  const columns = responseFormat.header === "required" ? (records.shift() ?? []) : [...(responseFormat.columns ?? [])];
  const acceptedHeaders = [columns, ...(responseFormat.headerAliases ?? [])];
  if (
    responseFormat.header === "optional" &&
    records[0] &&
    acceptedHeaders.some((header) => columnsMatch(records[0]!, header))
  ) {
    records.shift();
  }
  return { rawText, columns, rows: records };
}

function isEmptySemrushReport(rawText: string): boolean {
  const message = rawText.trim();
  if (!message.startsWith("ERROR ")) {
    return false;
  }
  const separatorIndex = message.indexOf(" :: ");
  const code = separatorIndex === -1 ? undefined : message.slice(6, separatorIndex).trim();
  // Semrush code 50 means no matching data.
  if (code === "50") return true;
  const detail = separatorIndex === -1 ? message : message.slice(separatorIndex + 4).trim();
  throw new ProviderRequestError(502, code ? `Semrush error ${code}: ${detail}` : `Semrush error: ${detail}`);
}

function columnsMatch(values: readonly string[], columns: readonly string[]) {
  return (
    values.length === columns.length &&
    values.every((value, index) => normalizeColumnName(value) === normalizeColumnName(columns[index]!))
  );
}

function normalizeColumnName(value: string) {
  let output = "";
  for (const character of value.toLowerCase()) {
    const code = character.charCodeAt(0);
    if ((code >= 48 && code <= 57) || (code >= 97 && code <= 122)) {
      output += character;
    }
  }
  return output;
}

function parseSemicolonRecords(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const commitField = () => {
    record.push(field);
    field = "";
  };
  const commitRecord = () => {
    commitField();
    records.push(record);
    record = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character !== '"') {
        field += character;
        continue;
      }
      if (text[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }
      quoted = false;
      continue;
    }
    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ";") {
      commitField();
    } else if (character === "\n") {
      commitRecord();
    } else if (character !== "\r") {
      field += character;
    }
  }
  commitRecord();
  while (records.length > 0 && records.at(-1)?.every((value) => value === "")) {
    records.pop();
  }
  if (records[0]?.[0]?.charCodeAt(0) === 0xfeff) {
    records[0]![0] = records[0]![0]!.slice(1);
  }
  return records;
}

function createAisaError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const errorValue = optionalRecord(payload)?.error;
  const error = optionalRecord(errorValue);
  const code = optionalString(error?.code);
  const message =
    optionalString(error?.message) ??
    optionalString(errorValue) ??
    optionalString(payload) ??
    optionalString(optionalRecord(payload)?.message) ??
    `AIsa request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status === 402) return new ProviderRequestError(402, message, payload, "insufficient_credit");
  if (isCredentialErrorCode(code)) {
    return phase === "validate" ? providerInputError(message) : new ProviderRequestError(409, message, payload);
  }
  if (response.status === 404) return new ProviderRequestError(404, message, payload, "provider_error");
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload, "invalid_input");
  }
  return new ProviderRequestError(response.status, message, payload);
}

function isCredentialErrorCode(code: string | undefined): boolean {
  return code === "missing_api_key" || code === "invalid_api_key" || code === "revoked_api_key";
}

function normalizeFirecrawlInput(name: string, input: Record<string, unknown>): Record<string, unknown> {
  if (!name.includes("firecrawl")) return input;
  const normalized = { ...input };
  const submission = name.startsWith("submit_");
  const validateUrl = (value: unknown): string => {
    const text = String(value).trim();
    const url = URL.parse(text);
    if (
      !url ||
      url.protocol !== "https:" ||
      !url.hostname ||
      ((submission || name === "scrape_firecrawl") && url.pathname.toLowerCase().endsWith(".pdf")) ||
      (submission && (url.username || url.password || url.hash))
    )
      throw providerInputError("Firecrawl requires an HTTPS URL without credentials, fragment or PDF suffix");
    return text;
  };
  if (input.url !== undefined) normalized.url = validateUrl(input.url);
  if (!submission) return normalized;
  if (Array.isArray(input.urls)) {
    const urls = input.urls.map(validateUrl);
    const unique = urls.map((value) => {
      while (value.endsWith("/")) value = value.slice(0, -1);
      return value;
    });
    if (new Set(unique).size !== urls.length)
      throw providerInputError("URLs must be unique after trimming whitespace and trailing slashes");
    normalized.urls = urls;
  }
  if (input.maxPriceUsd !== undefined) {
    const amount = String(input.maxPriceUsd).trim();
    if (!amount || !Number.isFinite(Number(amount)) || Number(amount) < 0)
      throw providerInputError("Expected a non-negative USD amount");
    normalized.maxPriceUsd = amount;
  }
  const normalizeSelectors = (value: Record<string, unknown>): Record<string, unknown> => {
    const output = { ...value };
    for (const [field, limit] of [
      ["includeTags", 128],
      ["excludeTags", 128],
      ["includePaths", 256],
      ["excludePaths", 256],
    ] as const) {
      if (!Array.isArray(value[field])) continue;
      output[field] = value[field].map((entry: unknown) => {
        const text = String(entry).trim();
        if (!text || Buffer.byteLength(text) > limit || text.includes("\r") || text.includes("\n"))
          throw providerInputError(`${field} entries must fit ${limit} UTF-8 bytes and contain no newlines`);
        return text;
      });
    }
    return output;
  };
  if (optionalRecord(input.scrapeOptions))
    normalized.scrapeOptions = normalizeSelectors(optionalRecord(input.scrapeOptions)!);
  return normalizeSelectors(normalized);
}
