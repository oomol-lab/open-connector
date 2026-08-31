import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger as asOptionalInteger,
  optionalNumber as asOptionalNumber,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

function requiredApiKey(input: { apiKey?: string }): string {
  if (input.apiKey?.trim()) return input.apiKey.trim();
  throw new ProviderRequestError(400, "apiKey is required");
}

export const spyfuApiBaseUrl: string = "https://api.spyfu.com";
export const spyfuProxyBaseUrl: string = `${spyfuApiBaseUrl}/apis`;

const spyfuDefaultRequestTimeoutMs = 30_000;

type SpyfuRequestPhase = "validate" | "execute";
type SpyfuRequestMethod = "GET" | "POST";
type SpyfuQuery = Record<string, string | number | boolean | undefined>;
type SpyfuActionHandler = (input: Record<string, unknown>, fetcher: typeof fetch, apiKey: string) => Promise<unknown>;

export const spyfuActionHandlers: ProviderActionHandlers<"spyfu", SpyfuActionHandler> = {
  async get_monthly_usage(input, fetcher, apiKey) {
    const usageMonth = readUsageMonth(input.usageMonth);
    const payload = await requestSpyfuJson({
      apiKey,
      path: `/apis/accounts_api/v2/usage/month/${usageMonth}`,
      fetcher,
      phase: "execute",
    });

    return {
      usageMonth,
      usage: parseUsageRows(payload),
    };
  },
  async get_usage_breakdown(input, fetcher, apiKey) {
    const usageMonth = readUsageMonth(input.usageMonth);
    const breakdownType = readUsageBreakdownType(input.breakdownType);
    const payload = await requestSpyfuJson({
      apiKey,
      path: `/apis/accounts_api/v2/usage/month/${usageMonth}/${breakdownType}`,
      fetcher,
      phase: "execute",
    });

    return {
      usageMonth,
      breakdownType,
      usage: parseUsageRows(payload),
    };
  },
  async get_latest_domain_stats(input, fetcher, apiKey) {
    const domain = readRequiredString(input.domain, "domain");
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/domain_stats_api/v2/getLatestDomainStats",
      query: {
        domain,
        countryCode: readOptionalString(input.countryCode),
        pastNMonths: asOptionalInteger(input.pastNMonths),
      },
      fetcher,
      phase: "execute",
    });

    const record = readResultRecord(payload);
    return normalizeResults(record, {
      domain: readOptionalString(record.domain) ?? domain,
    });
  },
  async get_bulk_domain_stats(input, fetcher, apiKey) {
    if (input.showOnlyLatest === false && Array.isArray(input.domains) && input.domains.length > 10) {
      throw new ProviderRequestError(
        400,
        "get_bulk_domain_stats accepts at most 10 domains when showOnlyLatest is false",
        400,
      );
    }
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/domain_stats_api/v2/getBulkDomainStats",
      query: {
        domains: joinRequiredStrings(input.domains, "domains"),
        showOnlyLatest: readRequiredBoolean(input.showOnlyLatest, "showOnlyLatest"),
        countryCode: readOptionalString(input.countryCode),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload));
  },
  async find_matching_domains(input, fetcher, apiKey) {
    validateOptionalRange(input, "minMonthlyBudget", "maxMonthlyBudget");
    validateOptionalRange(input, "minMonthlyOrganicClicks", "maxMonthlyOrganicClicks");
    validateOptionalRange(input, "minMonthlyOrganicValue", "maxMonthlyOrganicValue");
    validateOptionalRange(input, "minMonthlyPaidClicks", "maxMonthlyPaidClicks");
    validateOptionalRange(input, "minTotalOrganicResults", "maxTotalOrganicResults");
    validateOptionalRange(input, "minStrength", "maxStrength");
    validateOptionalRange(input, "minAverageOrganicRank", "maxAverageOrganicRank");
    validateOptionalRange(input, "minAverageAdRank", "maxAverageAdRank");
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/domain_stats_api/v2/getMatchingDomains",
      query: {
        query: readRequiredString(input.query, "query"),
        countryCode: readOptionalString(input.countryCode),
        sortBy: readOptionalString(input.sortBy),
        sortOrder: readOptionalString(input.sortOrder),
        "monthlyBudget.min": asOptionalNumber(input.minMonthlyBudget),
        "monthlyBudget.max": asOptionalNumber(input.maxMonthlyBudget),
        "monthlyOrganicClicks.min": asOptionalNumber(input.minMonthlyOrganicClicks),
        "monthlyOrganicClicks.max": asOptionalNumber(input.maxMonthlyOrganicClicks),
        "monthlyOrganicValue.min": asOptionalNumber(input.minMonthlyOrganicValue),
        "monthlyOrganicValue.max": asOptionalNumber(input.maxMonthlyOrganicValue),
        "monthlyPaidClicks.min": asOptionalNumber(input.minMonthlyPaidClicks),
        "monthlyPaidClicks.max": asOptionalNumber(input.maxMonthlyPaidClicks),
        "totalOrganicResults.min": asOptionalNumber(input.minTotalOrganicResults),
        "totalOrganicResults.max": asOptionalNumber(input.maxTotalOrganicResults),
        "strength.min": asOptionalNumber(input.minStrength),
        "strength.max": asOptionalNumber(input.maxStrength),
        "averageOrganicRank.min": asOptionalNumber(input.minAverageOrganicRank),
        "averageOrganicRank.max": asOptionalNumber(input.maxAverageOrganicRank),
        "averageAdRank.min": asOptionalNumber(input.minAverageAdRank),
        "averageAdRank.max": asOptionalNumber(input.maxAverageAdRank),
        pageSize: asOptionalInteger(input.pageSize) ?? 5,
        startingRow: asOptionalInteger(input.startingRow),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload));
  },
  async get_seo_keywords(input, fetcher, apiKey) {
    const searchType = readRequiredString(input.searchType, "searchType");
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/serp_api/v2/seo/getSeoKeywords",
      query: {
        query: readRequiredString(input.query, "query"),
        searchType,
        compareDomain: readOptionalString(input.compareDomain),
        excludeHomepageKeywords: optionalBoolean(input.excludeHomepageKeywords),
        exactMatch: optionalBoolean(input.exactMatch),
        ...buildSharedKeywordQuery(input),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload), { searchType });
  },
  async get_top_pages(input, fetcher, apiKey) {
    validateOptionalRange(input, "minSeoClicks", "maxSeoClicks");
    const searchType = readRequiredString(input.searchType, "searchType");
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/serp_api/v2/seo/getTopPages",
      query: {
        query: readRequiredString(input.query, "query"),
        searchType,
        keywordFilter: readOptionalString(input.keywordFilter),
        "seoClicks.min": asOptionalNumber(input.minSeoClicks),
        "seoClicks.max": asOptionalNumber(input.maxSeoClicks),
        countryCode: readOptionalString(input.countryCode),
        pageSize: asOptionalInteger(input.pageSize) ?? 5,
        startingRow: asOptionalInteger(input.startingRow),
        sortOrder: readOptionalString(input.sortOrder),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload), { searchType });
  },
  async get_serp_analysis(input, fetcher, apiKey) {
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/serp_api/v2/seo/getSerpAnalysisKeywords",
      query: {
        keyword: readRequiredString(input.keyword, "keyword"),
        countryCode: readOptionalString(input.countryCode),
        pageSize: asOptionalInteger(input.pageSize) ?? 10,
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload));
  },
  async get_live_seo_stats(input, fetcher, apiKey) {
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/serp_api/v2/seo/getLiveSeoStats",
      query: {
        query: readRequiredString(input.query, "query"),
        countryCode: readOptionalString(input.countryCode),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeLiveSeoStats(readResultRecord(payload));
  },
  async get_domain_ranking_history(input, fetcher, apiKey) {
    const { startMonth, endMonth } = readMonthRange(input);

    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/organic_history_api/v2/historic/getHistoricRankingsForDomain",
      query: {
        domain: readRequiredString(input.domain, "domain"),
        queryType: readOptionalString(input.queryType),
        startDate: startMonth,
        endDate: endMonth,
        includeTerms: joinOptionalStrings(input.includeTerms),
        includeAnyTerm: optionalBoolean(input.includeAnyTerm),
        excludeTerms: joinOptionalStrings(input.excludeTerms),
        countryCode: readOptionalString(input.countryCode),
        sortBy: readOptionalString(input.sortBy),
        sortOrder: readOptionalString(input.sortOrder),
        pageSize: asOptionalInteger(input.pageSize) ?? 5,
        startingRow: asOptionalInteger(input.startingRow),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeRankingHistory(readResultRecord(payload));
  },
  async get_keyword_domain_rankings(input, fetcher, apiKey) {
    const { startMonth, endMonth } = readMonthRange(input);
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/organic_history_api/v2/historic/getHistoricRankingsForKeywordOnDomains",
      query: {
        keyword: readRequiredString(input.keyword, "keyword"),
        domains: joinRequiredStrings(input.domains, "domains"),
        startDate: startMonth,
        endDate: endMonth,
        countryCode: readOptionalString(input.countryCode),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload));
  },
  async get_domain_keyword_rankings(input, fetcher, apiKey) {
    const { startMonth, endMonth } = readMonthRange(input);
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/organic_history_api/v2/historic/getHistoricRankingsForDomainOnKeywords",
      query: {
        domain: readRequiredString(input.domain, "domain"),
        keywords: joinRequiredStrings(input.keywords, "keywords"),
        startDate: startMonth,
        endDate: endMonth,
        countryCode: readOptionalString(input.countryCode),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload));
  },
  async get_competitors(input, fetcher, apiKey) {
    const competitorType = readCompetitorType(input.competitorType);
    const competitorPath =
      competitorType === "combined"
        ? "/apis/competitors_api/v2/combined/getCombinedTopCompetitors"
        : `/apis/competitors_api/v2/${competitorType}/getTopCompetitors`;
    const payload = await requestSpyfuJson({
      apiKey,
      path: competitorPath,
      query: {
        domain: readRequiredString(input.domain, "domain"),
        countryCode: readOptionalString(input.countryCode),
        pageSize: asOptionalInteger(input.pageSize) ?? 5,
        startingRow: asOptionalInteger(input.startingRow),
        sortBy: readOptionalString(input.sortBy),
        sortOrder: readOptionalString(input.sortOrder),
      },
      fetcher,
      phase: "execute",
    });

    const record = readResultRecord(payload);
    if (competitorType !== "combined") {
      return normalizeResults(record, { competitorType });
    }

    const results = readOptionalResultRows(record.combinedCompetitors);
    const totalMatchingResults = readOptionalCount(record.totalMatchingResults);
    return {
      competitorType,
      resultCount: readOptionalCount(record.resultCount) ?? results.length,
      ...(totalMatchingResults === undefined ? {} : { totalMatchingResults }),
      results,
      ppcResults: readOptionalResultRows(record.ppcCompetitors),
      seoResults: readOptionalResultRows(record.seoCompetitors),
    };
  },
  async get_competing_keywords(input, fetcher, apiKey) {
    const keywordType = readKeywordType(input.keywordType);
    const payload = await requestSpyfuJson({
      apiKey,
      path: `/apis/keyword_api/v2/kombat/getCompeting${keywordType === "seo" ? "Seo" : "Ppc"}Keywords`,
      query: {
        includeDomainsCsv: joinRequiredStrings(input.includedDomains, "includedDomains"),
        excludeDomainsCsv: joinOptionalStrings(input.excludedDomains),
        isIntersection: readRequiredBoolean(input.isIntersection, "isIntersection"),
        countryCode: readOptionalString(input.countryCode),
        pageSize: asOptionalInteger(input.pageSize) ?? 5,
        startingRow: asOptionalInteger(input.startingRow),
        sortOrder: readOptionalString(input.sortOrder),
        adultFilter: optionalBoolean(input.adultFilter),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload), { keywordType });
  },
  async get_keyword_information(input, fetcher, apiKey) {
    const payload = await requestSpyfuJson({
      apiKey,
      method: "POST",
      path: "/apis/keyword_api/v2/related/getKeywordInformation",
      body: {
        keywords: joinRequiredStrings(input.keywords, "keywords"),
        ...(readOptionalString(input.countryCode) === undefined
          ? {}
          : { countryCode: readOptionalString(input.countryCode) }),
        ...(optionalBoolean(input.adultFilter) === undefined
          ? {}
          : { adultFilter: optionalBoolean(input.adultFilter) }),
        ...(optionalBoolean(input.onlyAdultKeywords) === undefined
          ? {}
          : { onlyAdultKeywords: optionalBoolean(input.onlyAdultKeywords) }),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload));
  },
  async get_keyword_expansions(input, fetcher, apiKey) {
    const keywordSearchType = readRequiredString(input.keywordSearchType, "keywordSearchType");
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/keyword_api/v2/related/getKeywordExpansions",
      query: {
        query: readRequiredString(input.query, "query"),
        keywordSearchType,
        ...buildSharedKeywordQuery(input),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload), { keywordSearchType });
  },
  async get_ppc_keywords(input, fetcher, apiKey) {
    const searchType = readPpcSearchType(input.searchType);
    const excludeDomain = readOptionalString(input.excludeDomain);
    if (searchType === "current_ads" && excludeDomain !== undefined) {
      throw new ProviderRequestError(400, "excludeDomain is not supported when searchType is current_ads");
    }

    const route = ppcRouteBySearchType[searchType];
    const payload = await requestSpyfuJson({
      apiKey,
      path: route,
      query: {
        query: readRequiredString(input.query, "query"),
        excludeDomain,
        ...buildSharedKeywordQuery(input),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload), { searchType });
  },
  async get_domain_ad_history(input, fetcher, apiKey) {
    const minSearchDateId = readOptionalDateId(input.minSearchDateId, "minSearchDateId");
    const maxSearchDateId = readOptionalDateId(input.maxSearchDateId, "maxSearchDateId");
    if (minSearchDateId !== undefined && maxSearchDateId !== undefined && minSearchDateId > maxSearchDateId) {
      throw new ProviderRequestError(400, "minSearchDateId must not be later than maxSearchDateId");
    }

    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/cloud_ad_history_api/v2/domain/getDomainAdHistoryByDate",
      query: {
        domain: readRequiredString(input.domain, "domain"),
        keywordFilter: readOptionalString(input.keywordFilter),
        minSearchDateId,
        maxSearchDateId,
        countryCode: readOptionalString(input.countryCode),
        pageSize: asOptionalInteger(input.pageSize) ?? 5,
        startingRow: asOptionalInteger(input.startingRow),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeDomainAdHistory(readResultRecord(payload));
  },
  async get_keyword_ad_history(input, fetcher, apiKey) {
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/cloud_ad_history_api/v2/term/getTermAdHistory",
      query: {
        term: readRequiredString(input.term, "term"),
        countryCode: readOptionalString(input.countryCode),
        pageSize: asOptionalInteger(input.pageSize) ?? 5,
        startingRow: asOptionalInteger(input.startingRow),
      },
      fetcher,
      phase: "execute",
    });

    return normalizeResults(readResultRecord(payload));
  },
  async get_keyword_ad_history_with_stats(input, fetcher, apiKey) {
    const payload = await requestSpyfuJson({
      apiKey,
      path: "/apis/cloud_ad_history_api/v2/term/getTermAdHistoryWithStats",
      query: {
        term: readRequiredString(input.term, "term"),
        countryCode: readOptionalString(input.countryCode),
        pageSize: asOptionalInteger(input.pageSize) ?? 5,
        startingRow: asOptionalInteger(input.startingRow),
      },
      fetcher,
      phase: "execute",
    });

    const record = readResultRecord(payload);
    const domains = readOptionalResultRows(record.domains);
    return {
      resultCount: readOptionalCount(record.resultCount) ?? domains.length,
      domains,
      topAds: readOptionalResultRows(record.topAds),
    };
  },
};

const ppcRouteBySearchType = {
  current_ads: "/apis/serp_api/v2/ppc/getPaidSerps",
  most_successful: "/apis/keyword_api/v2/ppc/getMostSuccessful",
  newly_acquired: "/apis/keyword_api/v2/ppc/getNewKeywords",
} as const;

export async function validateSpyfuCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}> {
  const usageMonth = currentUsageMonth();
  const payload = await requestSpyfuJson({
    apiKey: requiredApiKey(input),
    path: `/apis/accounts_api/v2/usage/month/${usageMonth}`,
    fetcher,
    phase: "validate",
  });
  const usage = parseUsageRows(payload);

  return {
    accountLabel: "SpyFu API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: spyfuApiBaseUrl,
      validationEndpoint: "/apis/accounts_api/v2/usage/month/{usageMonth}",
      usageMonth,
      usageEntryCount: usage.length,
    },
  };
}

function buildSharedKeywordQuery(input: Record<string, unknown>): SpyfuQuery {
  return {
    countryCode: readOptionalString(input.countryCode),
    includeTerms: joinOptionalStrings(input.includeTerms),
    includeAnyTerm: optionalBoolean(input.includeAnyTerm),
    excludeTerms: joinOptionalStrings(input.excludeTerms),
    pageSize: asOptionalInteger(input.pageSize),
    startingRow: asOptionalInteger(input.startingRow),
    sortOrder: readOptionalString(input.sortOrder),
    adultFilter: optionalBoolean(input.adultFilter),
    onlyAdultKeywords: optionalBoolean(input.onlyAdultKeywords),
  };
}

async function requestSpyfuJson(input: {
  apiKey: string;
  path: string;
  method?: SpyfuRequestMethod;
  query?: SpyfuQuery;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: SpyfuRequestPhase;
}) {
  const timeoutSignal = AbortSignal.timeout(spyfuDefaultRequestTimeoutMs);
  const method = input.method ?? "GET";
  const url = new URL(input.path, spyfuApiBaseUrl);
  url.searchParams.set("api_key", input.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  try {
    const response = await input.fetcher(url, {
      method,
      headers,
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeoutSignal,
    });
    const payload = await readSpyfuPayload(response);
    if (!response.ok) {
      throw createSpyfuError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutSignal.aborted || isAbortError(error)) {
      throw new ProviderRequestError(504, "SpyFu request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SpyFu request failed: ${error.message}` : "SpyFu request failed",
    );
  }
}

async function readSpyfuPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "SpyFu returned invalid JSON");
  }
}

function createSpyfuError(response: Response, payload: unknown, phase: SpyfuRequestPhase) {
  const message = extractSpyfuErrorMessage(payload) ?? `SpyFu request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(409, message);
  }

  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractSpyfuErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = asOptionalObject(payload);
  if (!record) {
    return undefined;
  }

  return (
    readOptionalString(record.message) ??
    readOptionalString(record.Message) ??
    readOptionalString(record.error) ??
    readOptionalString(record.Error) ??
    readFirstString(record.AuthenticationFailed) ??
    readFirstString(record.Details)
  );
}

function readFirstString(value: unknown) {
  if (typeof value === "string") {
    return readOptionalString(value);
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const item of value) {
    const message = readOptionalString(item);
    if (message !== undefined) {
      return message;
    }
  }
  return undefined;
}

function normalizeResults(record: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const results = readOptionalResultRows(record.results);
  const resultCount = readOptionalCount(record.resultCount) ?? results.length;
  const totalMatchingResults = readOptionalCount(record.totalMatchingResults);
  return {
    ...extra,
    resultCount,
    ...(totalMatchingResults === undefined ? {} : { totalMatchingResults }),
    results,
  };
}

function normalizeDomainAdHistory(record: Record<string, unknown>) {
  return {
    ...normalizeResults(record),
    ...optionalTypedField("totalMatchingResultsIsPartial", record.totalMatchingResultsIsPartial, "boolean"),
    ...optionalTypedField("startingRow", record.startingRow, "integer"),
    ...optionalTypedField("pageSize", record.pageSize, "integer"),
    ...optionalTypedField("hasMoreResults", record.hasMoreResults, "boolean"),
    ...optionalTypedField("totalMatchingKeywords", record.totalMatchingKeywords, "integer"),
    ...optionalTypedField("hasMoreKeywordResults", record.hasMoreKeywordResults, "boolean"),
  };
}

function normalizeLiveSeoStats(record: Record<string, unknown>) {
  return {
    resultCount: readOptionalCount(record.resultCount) ?? 1,
    ...optionalNullableStringField("domain", record.domain),
    ...optionalNullableStringField("url", record.url),
    ...optionalTypedField("totalOrganicResults", record.totalOrganicResults, "integer"),
    ...optionalTypedField("monthlyOrganicClicks", record.monthlyOrganicClicks, "number"),
    ...optionalTypedField("monthlyOrganicClickValue", record.monthlyOrganicClickValue, "number"),
    ...optionalTypedField("totalSearchVolume", record.totalSearchVolume, "number"),
  };
}

function normalizeRankingHistory(record: Record<string, unknown>) {
  return {
    ...normalizeResults(record),
    ...optionalTypedField("totalVolume", record.totalVolume, "integer"),
    ...optionalTypedField("totalClicks", record.totalClicks, "integer"),
    ...optionalTypedField("totalClicksChange", record.totalClicksChange, "integer"),
    ...optionalTypedField("totalRankChange", record.totalRankChange, "integer"),
    ...optionalTypedField("rankAverage", record.rankAverage, "number"),
    ...optionalTypedField("rankAverageChange", record.rankAverageChange, "number"),
  };
}

function optionalNullableStringField(key: string, value: unknown): Record<string, unknown> {
  return value === null || typeof value === "string" ? { [key]: value } : {};
}

function optionalTypedField(
  key: string,
  value: unknown,
  type: "integer" | "number" | "boolean",
): Record<string, unknown> {
  if (type === "boolean") {
    return typeof value === "boolean" ? { [key]: value } : {};
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? { [key]: value } : {};
  }
  return typeof value === "number" && Number.isInteger(value) ? { [key]: value } : {};
}

function readResultRecord(payload: unknown) {
  const record = asOptionalObject(payload);
  if (!record) {
    throw new ProviderRequestError(502, "SpyFu returned an invalid result wrapper");
  }
  return record;
}

function readOptionalResultRows(value: unknown) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "SpyFu returned a non-array results field");
  }

  return value.map((row) => {
    const record = asOptionalObject(row);
    if (!record) {
      throw new ProviderRequestError(502, "SpyFu returned an invalid result row");
    }
    return record;
  });
}

function parseUsageRows(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "SpyFu returned an invalid usage response");
  }
  return payload.map((row) => {
    const record = asOptionalObject(row);
    if (!record) {
      throw new ProviderRequestError(502, "SpyFu returned an invalid usage row");
    }
    return record;
  });
}

function readOptionalCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function readRequiredString(value: unknown, fieldName: string) {
  const result = readOptionalString(value);
  if (result === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function readOptionalString(value: unknown) {
  const result = asOptionalString(value)?.trim();
  return result ? result : undefined;
}

function joinRequiredStrings(value: unknown, fieldName: string) {
  const result = joinOptionalStrings(value);
  if (result === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function joinOptionalStrings(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "string array input is required");
  }
  const values = value.map((item) => {
    const stringValue = readRequiredString(item, "array item");
    if (stringValue.includes(",")) {
      throw new ProviderRequestError(400, "array items must not contain commas because SpyFu uses CSV parameters");
    }
    return stringValue;
  });
  return values.length === 0 ? undefined : values.join(",");
}

function readRequiredBoolean(value: unknown, fieldName: string) {
  const result = optionalBoolean(value);
  if (result === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function validateOptionalRange(input: Record<string, unknown>, minimumField: string, maximumField: string) {
  const minimum = asOptionalNumber(input[minimumField]);
  const maximum = asOptionalNumber(input[maximumField]);
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new ProviderRequestError(400, `${minimumField} must not be greater than ${maximumField}`);
  }
}

function readOptionalDateId(value: unknown, fieldName: string) {
  const dateId = asOptionalInteger(value);
  if (dateId === undefined) {
    return undefined;
  }
  const year = Math.floor(dateId / 10_000);
  const month = Math.floor((dateId % 10_000) / 100);
  const day = dateId % 100;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 2999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new ProviderRequestError(400, `${fieldName} must be a valid YYYYMMDD date`);
  }
  return dateId;
}

function readCompetitorType(value: unknown) {
  const type = readRequiredString(value, "competitorType");
  if (type === "seo" || type === "ppc" || type === "combined") {
    return type;
  }
  throw new ProviderRequestError(400, `unsupported competitorType: ${type}`);
}

function readKeywordType(value: unknown) {
  const type = readRequiredString(value, "keywordType");
  if (type === "seo" || type === "ppc") {
    return type;
  }
  throw new ProviderRequestError(400, `unsupported keywordType: ${type}`);
}

function readPpcSearchType(value: unknown): keyof typeof ppcRouteBySearchType {
  const searchType = readRequiredString(value, "searchType");
  if (searchType in ppcRouteBySearchType) {
    return searchType as keyof typeof ppcRouteBySearchType;
  }
  throw new ProviderRequestError(400, `unsupported PPC searchType: ${searchType}`);
}

function readUsageBreakdownType(value: unknown) {
  const breakdownType = readRequiredString(value, "breakdownType");
  if (breakdownType === "daily" || breakdownType === "method") {
    return breakdownType;
  }
  throw new ProviderRequestError(400, `unsupported usage breakdownType: ${breakdownType}`);
}

function readUsageMonth(value: unknown) {
  if (value === undefined) {
    return currentUsageMonth();
  }
  return readYearMonth(value, "usageMonth");
}

function readOptionalYearMonth(value: unknown, fieldName: string) {
  return value === undefined ? undefined : readYearMonth(value, fieldName);
}

function readMonthRange(input: Record<string, unknown>) {
  const startMonth = readOptionalYearMonth(input.startMonth, "startMonth");
  const endMonth = readOptionalYearMonth(input.endMonth, "endMonth");
  if (startMonth !== undefined && endMonth !== undefined && startMonth > endMonth) {
    throw new ProviderRequestError(400, "startMonth must not be later than endMonth");
  }
  return { startMonth, endMonth };
}

function readYearMonth(value: unknown, fieldName: string) {
  const yearMonth = readRequiredString(value, fieldName);
  const [yearText, monthText, extra] = yearMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (
    extra !== undefined ||
    yearText?.length !== 4 ||
    monthText?.length !== 2 ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    year < 1900 ||
    year > 2999 ||
    month < 1 ||
    month > 12
  ) {
    throw new ProviderRequestError(400, `${fieldName} must use YYYY-MM format`);
  }
  return yearMonth;
}

function currentUsageMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
