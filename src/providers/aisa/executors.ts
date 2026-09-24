import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  readProviderJsonBody,
  runProviderRequest,
} from "../provider-runtime.ts";

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
  get_credits_balance: { path: "/v1/credits/balance", query: {} },
  get_usage: {
    path: "/v1/usage",
    query: { startTimestamp: "start_time", endTimestamp: "end_time" },
  },
  query_dataforseo_chatgpt: dataForSeoLlmRoute("/apis/v1/dataforseo/ai_optimization/chat_gpt/llm_responses/live"),
  query_dataforseo_claude: dataForSeoLlmRoute("/apis/v1/dataforseo/ai_optimization/claude/llm_responses/live"),
  query_dataforseo_gemini: dataForSeoLlmRoute("/apis/v1/dataforseo/ai_optimization/gemini/llm_responses/live"),
  query_dataforseo_perplexity: dataForSeoLlmRoute("/apis/v1/dataforseo/ai_optimization/perplexity/llm_responses/live"),
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
    path: "/apis/v2/apollo/people/match",
    method: "POST",
    query: {
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
    path: "/apis/v2/apollo/people/bulk_match",
    method: "POST",
    query: {},
    body: { people: "details" },
    snakeCaseBody: true,
    bodyKeyAliases: { personId: "id" },
  },
  enrich_apollo_organization: {
    path: "/apis/v2/apollo/organizations/enrich",
    query: { domain: "domain" },
  },
  enrich_apollo_organizations: {
    path: "/apis/v2/apollo/organizations/bulk_enrich",
    method: "POST",
    query: { domains: "domains[]" },
  },
  search_apollo_people: {
    path: "/apis/v2/apollo/mixed_people/api_search",
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
    path: "/apis/v2/apollo/mixed_companies/search",
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
    path: "/apis/v2/apollo/organizations/{organizationId}",
    pathParams: { organizationId: "organizationId" },
    query: {},
  },
  get_apollo_job_postings: {
    path: "/apis/v2/apollo/organizations/{organizationId}/job_postings",
    pathParams: { organizationId: "organizationId" },
    query: { page: "page", perPage: "per_page" },
  },
  search_apollo_company_news: {
    path: "/apis/v2/apollo/news_articles/search",
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
  get_semrush_keyword_overview: {
    path: "/apis/v1/semrush/keyword-overview",
    query: { phrase: "phrase", database: "database" },
  },
  get_semrush_keyword_difficulty: {
    path: "/apis/v1/semrush/keyword-difficulty",
    query: { phrases: "phrase", database: "database" },
    joined: { phrases: ";" },
  },
  get_semrush_broad_match_keywords: {
    path: "/apis/v1/semrush/broad-match-keywords",
    query: { phrase: "phrase", database: "database" },
  },
  get_semrush_question_keywords: {
    path: "/apis/v1/semrush/question-keywords",
    query: { phrase: "phrase", database: "database" },
  },
  get_semrush_domain_rank_history: {
    path: "/apis/v1/semrush/domain-rank-history",
    query: { domain: "domain", database: "database" },
  },
  compare_semrush_domains: {
    path: "/apis/v1/semrush/domain-vs-domain",
    query: { comparison: "domains", database: "database" },
  },
  get_semrush_backlinks_overview: {
    path: "/apis/v1/semrush/backlinks-overview",
    query: { target: "target" },
  },
  get_semrush_backlinks: {
    path: "/apis/v1/semrush/backlinks",
    query: { target: "target", targetType: "target_type" },
  },
  get_semrush_referring_domains: {
    path: "/apis/v1/semrush/referring-domains",
    query: { target: "target", targetType: "target_type" },
  },
  get_semrush_backlink_competitors: {
    path: "/apis/v1/semrush/backlink-competitors",
    query: { target: "target", targetType: "target_type" },
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
  const body = Object.fromEntries(
    Object.entries(route.body)
      .filter(([inputName]) => input[inputName] !== undefined)
      .map(([inputName, bodyName]) => [bodyName, input[inputName]]),
  );
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
) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(fixed)) {
    query.set(name, value);
  }
  for (const [inputName, queryName] of Object.entries(mapping)) {
    const value = input[inputName];
    if (value == null) {
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

const handlers = Object.fromEntries(
  Object.entries(aisaActionRoutes).map(([name, route]) => [
    name,
    (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
      requestAisaJson(
        buildAisaPath(route.path, input, route.pathParams),
        buildAisaQuery(input, route.query, route.commaSeparated ?? [], route.joined ?? {}, route.fixedQuery ?? {}),
        context,
        route.method ?? "GET",
        buildAisaBody(input, route),
      ),
  ]),
) as ProviderActionHandlers<"aisa", Handler>;

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: aisaApiOrigin,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = optionalRecord(
      await requestAisaJson(
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

async function requestAisaJson(
  path: string,
  query: URLSearchParams,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  method: "GET" | "POST",
  body: unknown,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "AIsa" }, async (signal) => {
    const url = new URL(path, aisaApiOrigin);
    url.search = query.toString();
    const headers = new Headers({ accept: "application/json", authorization: `Bearer ${context.apiKey}` });
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await context.fetcher(url, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "AIsa returned invalid JSON",
    });
    if (!response.ok) throw createAisaError(response, payload, phase);
    return payload;
  });
}

function createAisaError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const error = optionalRecord(optionalRecord(payload)?.error);
  const code = optionalString(error?.code);
  const message =
    optionalString(error?.message) ??
    optionalString(optionalRecord(payload)?.message) ??
    `AIsa request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status === 402) return new ProviderRequestError(402, message, payload, "insufficient_credit");
  if (isCredentialErrorCode(code)) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : 409,
      message,
      payload,
      phase === "validate" ? "invalid_input" : "credential_expired",
    );
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload, "invalid_input");
  }
  return new ProviderRequestError(response.status, message, payload);
}

function isCredentialErrorCode(code: string | undefined): boolean {
  return code === "missing_api_key" || code === "invalid_api_key" || code === "revoked_api_key";
}
