import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const similarwebApiBaseUrl = "https://api.similarweb.com";

type SimilarwebQueryValue = string | number | boolean | undefined;
type SimilarwebRequestPhase = "validate" | "execute";
type SimilarwebActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const similarwebDigitalRankApiActionHandlers: ProviderActionHandlers<
  "similarweb_digitalrank_api",
  SimilarwebActionHandler
> = {
  get_subscription_status(_input, context) {
    return getSubscriptionStatus(context);
  },
  get_rank_tracker_describe(_input, context) {
    return getRankTrackerDescribe(context);
  },
  get_similar_rank_top_sites(input, context) {
    return getSimilarRankTopSites(input, context);
  },
};

export async function validateSimilarwebDigitalRankApiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = normalizeUserCapabilities(
    await similarwebGetJson("/user-capabilities", {}, apiKey, fetcher, "validate", signal),
  );

  return {
    profile: {
      accountId: "similarweb",
      displayName: "Similarweb API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: similarwebApiBaseUrl,
      validationEndpoint: "/user-capabilities",
      allowance: payload.allowance,
      userRemaining: payload.userRemaining,
    },
  };
}

async function getSubscriptionStatus(context: ApiKeyProviderContext): Promise<unknown> {
  return normalizeUserCapabilities(
    await similarwebGetJson("/user-capabilities", {}, context.apiKey, context.fetcher, "execute", context.signal),
  );
}

async function getRankTrackerDescribe(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await similarwebGetJson(
    "/v4/rank-tracker/reports/describe",
    {},
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );

  return {
    campaigns: readCampaignList(payload).map((item) => normalizeCampaign(item)),
  };
}

async function getSimilarRankTopSites(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const rawCategory = optionalString(input.category);
  const category =
    rawCategory && rawCategory.toLowerCase() !== "all" && rawCategory.toLowerCase() !== "$all" ? rawCategory : "$All";
  const startDate = optionalString(input.startDate);
  const endDate = optionalString(input.endDate);
  const payload = await similarwebGetJson(
    `/v4/website/${encodeURIComponent(category)}/topsites/total`,
    compactObject({
      country: normalizeCountry(optionalString(input.country)),
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      format: "json",
      start_date: startDate ?? endDate,
      end_date: endDate ?? startDate,
      sort: optionalString(input.sort),
      asc: optionalBoolean(input.ascending),
      show_verified: optionalBoolean(input.showVerified),
      main_domain_only: optionalBoolean(input.mainDomainOnly),
    }),
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );

  return normalizeTopSitesPayload(payload);
}

async function similarwebGetJson(
  path: string,
  query: Record<string, SimilarwebQueryValue>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: SimilarwebRequestPhase,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = new URL(path, similarwebApiBaseUrl);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    payload = await readSimilarwebPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Similarweb request failed: ${error.message}` : "Similarweb request failed",
    );
  }

  if (!response.ok) {
    throw createSimilarwebError(response, payload, phase);
  }

  return payload;
}

async function readSimilarwebPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSimilarwebError(
  response: Response,
  payload: unknown,
  phase: SimilarwebRequestPhase,
): ProviderRequestError {
  const message =
    extractSimilarwebErrorMessage(payload) ||
    response.statusText ||
    `Similarweb request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractSimilarwebErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const meta = optionalRecord(record.meta);
  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstErrorRecord = optionalRecord(errors?.[0]);

  return (
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(meta?.error) ??
    optionalString(meta?.message) ??
    optionalString(firstErrorRecord?.message) ??
    optionalString(firstErrorRecord?.detail) ??
    optionalString(meta?.status)
  );
}

function normalizeUserCapabilities(payload: unknown): { allowance: number; userRemaining: number } {
  const record = unwrapDataRecord(payload);
  return {
    allowance: readRequiredInteger(record.allowance ?? record.total_allowance, "allowance"),
    userRemaining: readRequiredInteger(record.user_remaining ?? record.userRemaining, "user_remaining"),
  };
}

function readCampaignList(payload: unknown): unknown[] {
  const record = unwrapDataRecord(payload);
  const campaigns = record.campaigns;
  if (!Array.isArray(campaigns)) {
    throw new ProviderRequestError(502, "Similarweb response missing campaigns array");
  }
  return campaigns;
}

function normalizeCampaign(payload: unknown): Record<string, unknown> {
  const record = requireObject(payload, "campaign");
  return {
    campaignId: readRequiredString(record.campaign_id ?? record.campaignId, "campaign_id"),
    campaignName: optionalString(record.campaign_name ?? record.campaignName),
    mainDomain: optionalString(record.main_domain ?? record.mainDomain),
    user: optionalString(record.user),
    createdTime: optionalString(record.created_time ?? record.createdTime),
    tags: readStringArray(record.tags),
    competitors: readStringArray(record.competitors),
    scrapingConfigurations: readObjectArray(
      record.scraping_configurations ?? record.scrapingConfigurations,
      "scraping_configurations",
    ).map((item) => ({
      id: readRequiredString(item.id, "id"),
      device: optionalString(item.device),
      language: optionalString(item.language),
      location: optionalString(item.location),
      searchEngine: optionalString(item.search_engine ?? item.searchEngine),
    })),
  };
}

function normalizeTopSitesPayload(payload: unknown): Record<string, unknown> {
  const record = unwrapDataRecord(payload);
  const topSites = record.top_sites ?? record.topSites;
  if (!Array.isArray(topSites)) {
    throw new ProviderRequestError(502, "Similarweb response missing top_sites array");
  }

  return compactObject({
    topSites: topSites.map((item) => {
      const topSite = requireObject(item, "top_site");
      return {
        rank: readRequiredInteger(topSite.rank, "rank"),
        domain: readRequiredString(topSite.domain, "domain"),
      };
    }),
    meta: normalizeTopSitesMeta(record.meta),
  });
}

function normalizeTopSitesMeta(payload: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return compactObject({
    status: optionalString(record.status),
    lastUpdated: optionalString(record.last_updated ?? record.lastUpdated),
    query: normalizeTopSitesQuery(record.query),
    request: normalizeTopSitesRequest(record.request),
  });
}

function normalizeTopSitesQuery(payload: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return compactObject({
    asc: optionalBoolean(record.asc),
    sort: optionalString(record.sort),
    limit: optionalInteger(record.limit),
    offset: optionalInteger(record.offset),
  });
}

function normalizeTopSitesRequest(payload: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return compactObject({
    state: optionalString(record.state),
    domain: optionalString(record.domain),
    format: optionalString(record.format),
    country: optionalString(record.country),
    endDate: optionalString(record.end_date ?? record.endDate),
    startDate: optionalString(record.start_date ?? record.startDate),
    showVerified: optionalBoolean(record.show_verified ?? record.showVerified),
    mainDomainOnly: optionalBoolean(record.main_domain_only ?? record.mainDomainOnly),
  });
}

function unwrapDataRecord(payload: unknown): Record<string, unknown> {
  const record = requireObject(payload, "response");
  const data = optionalRecord(record.data);
  return data ?? record;
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Similarweb response missing object field: ${fieldName}`);
  }
  return record;
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => requireObject(item, fieldName));
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Similarweb response missing string field: ${fieldName}`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Similarweb response missing integer field: ${fieldName}`);
  }
  return parsed;
}

function normalizeCountry(country: string | undefined): string {
  return country ? country.toLowerCase() : "world";
}
