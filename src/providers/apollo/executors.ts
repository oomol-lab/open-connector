import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ApolloActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "apollo";
const apolloApiBaseUrl = "https://api.apollo.io";
const apolloDefaultRequestTimeoutMs = 30_000;

type ApolloQueryValue = boolean | number | string | string[] | undefined;
type ApolloRequestPhase = "validate" | "execute";
type ApolloActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const apolloActionHandlers: Record<ApolloActionName, ApolloActionHandler> = {
  get_api_usage_stats(_input, context) {
    return getApiUsageStats(context);
  },
  search_organizations(input, context) {
    return searchOrganizations(input, context);
  },
  search_people(input, context) {
    return searchPeople(input, context);
  },
  enrich_organization(input, context) {
    return enrichOrganization(input, context);
  },
  enrich_person(input, context) {
    return enrichPerson(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, apolloActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestApolloJson({
      apiKey: input.apiKey,
      path: "/api/v1/usage_stats/api_usage_stats",
      method: "POST",
      fetcher,
      signal,
      phase: "validate",
    });
    const usage = normalizeUsageStats(payload);

    return {
      profile: {
        accountId: usage.teamId,
        displayName: "Apollo Master API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: apolloApiBaseUrl,
        validationEndpoint: "/api/v1/usage_stats/api_usage_stats",
        teamId: usage.teamId,
        creditsUsed: usage.credits.used,
        creditsLimit: usage.credits.limit,
        creditsRemaining: usage.credits.remaining,
        usagePeriodStart: usage.usagePeriodStart,
        usagePeriodEnd: usage.usagePeriodEnd,
      }),
    };
  },
};

async function getApiUsageStats(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestApolloJson({
    apiKey: context.apiKey,
    path: "/api/v1/usage_stats/api_usage_stats",
    method: "POST",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    usage: normalizeUsageStats(payload),
  };
}

async function searchOrganizations(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestApolloJson({
    apiKey: context.apiKey,
    path: "/api/v1/mixed_companies/search",
    method: "POST",
    query: buildOrganizationSearchQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requireObjectPayload(payload, "Apollo organization search response");

  return {
    organizations: Array.isArray(record.organizations) ? record.organizations : [],
    pagination: optionalRecord(record.pagination),
    breadcrumbs: Array.isArray(record.breadcrumbs) ? record.breadcrumbs : undefined,
  };
}

async function searchPeople(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestApolloJson({
    apiKey: context.apiKey,
    path: "/api/v1/mixed_people/api_search",
    method: "POST",
    query: buildPeopleSearchQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requireObjectPayload(payload, "Apollo people search response");

  return {
    people: Array.isArray(record.people) ? record.people : [],
    pagination: optionalRecord(record.pagination),
  };
}

async function enrichOrganization(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestApolloJson({
    apiKey: context.apiKey,
    path: "/api/v1/organizations/enrich",
    method: "GET",
    query: {
      domain: requireInputString(input.domain, "domain"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    organization: unwrapApolloEntity(payload, "organization"),
  };
}

async function enrichPerson(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestApolloJson({
    apiKey: context.apiKey,
    path: "/api/v1/people/match",
    method: "POST",
    query: buildPeopleEnrichmentQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    person: unwrapApolloEntity(payload, "person"),
  };
}

async function requestApolloJson(input: {
  apiKey: string;
  path: string;
  query?: Record<string, ApolloQueryValue>;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: ApolloRequestPhase;
}): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(apolloDefaultRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  const url = new URL(input.path, apolloApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendApolloQueryValue(url, key, value);
  }

  let response: Response;
  let payload: unknown;
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      signal,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    payload = await readApolloPayload(response);
  } catch (error) {
    if (timeoutSignal.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(502, `apollo ${input.path} request timed out after 30 seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? error.message : "Apollo request failed",
    );
  }

  if (!response.ok) {
    throw createApolloError(response.status, payload, input.phase);
  }

  return payload;
}

async function readApolloPayload(response: Response): Promise<unknown> {
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

function buildOrganizationSearchQuery(input: Record<string, unknown>): Record<string, ApolloQueryValue> {
  return compactObject({
    page: optionalNumber(input.page),
    per_page: optionalNumber(input.perPage),
    q_organization_name: optionalString(input.organizationName),
    "organization_ids[]": asStringList(input.organizationIds),
    "organization_locations[]": asStringList(input.organizationLocations),
    "organization_not_locations[]": asStringList(input.excludedOrganizationLocations),
    "q_organization_domains_list[]": asStringList(input.organizationDomains),
    "q_organization_keyword_tags[]": asStringList(input.organizationKeywordTags),
    "organization_num_employees_ranges[]": asStringList(input.organizationEmployeeRanges),
    "revenue_range[min]": optionalNumber(input.organizationRevenueMin),
    "revenue_range[max]": optionalNumber(input.organizationRevenueMax),
  });
}

function buildPeopleSearchQuery(input: Record<string, unknown>): Record<string, ApolloQueryValue> {
  return compactObject({
    page: optionalNumber(input.page),
    per_page: optionalNumber(input.perPage),
    q_keywords: optionalString(input.keywords),
    "person_titles[]": asStringList(input.personTitles),
    include_similar_titles: typeof input.includeSimilarTitles === "boolean" ? input.includeSimilarTitles : undefined,
    "organization_ids[]": asStringList(input.organizationIds),
    "person_locations[]": asStringList(input.personLocations),
    "person_seniorities[]": asStringList(input.personSeniorities),
    "contact_email_status[]": asStringList(input.contactEmailStatus),
    "organization_locations[]": asStringList(input.organizationLocations),
    "q_organization_domains_list[]": asStringList(input.organizationDomains),
    "organization_num_employees_ranges[]": asStringList(input.organizationEmployeeRanges),
    "revenue_range[min]": optionalNumber(input.organizationRevenueMin),
    "revenue_range[max]": optionalNumber(input.organizationRevenueMax),
  });
}

function buildPeopleEnrichmentQuery(input: Record<string, unknown>): Record<string, ApolloQueryValue> {
  return compactObject({
    id: optionalString(input.id),
    email: optionalString(input.email),
    hashed_email: optionalString(input.hashedEmail),
    linkedin_url: optionalString(input.linkedinUrl),
    name: optionalString(input.name),
    first_name: optionalString(input.firstName),
    last_name: optionalString(input.lastName),
    organization_name: optionalString(input.organizationName),
    domain: optionalString(input.domain),
    reveal_personal_emails:
      typeof input.revealPersonalEmails === "boolean" ? input.revealPersonalEmails : undefined,
  });
}

function appendApolloQueryValue(url: URL, key: string, value: ApolloQueryValue): void {
  if (value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== "") {
        url.searchParams.append(key, item);
      }
    }
    return;
  }

  url.searchParams.set(key, String(value));
}

function createApolloError(status: number, payload: unknown, phase: ApolloRequestPhase): ProviderRequestError {
  const message = extractApolloErrorMessage(payload) ?? `Apollo request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractApolloErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalString(record.error);
  if (error) {
    return error;
  }

  const message = optionalString(record.message);
  if (message) {
    return message;
  }

  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = errors?.[0];
  if (typeof firstError === "string" && firstError.trim() !== "") {
    return firstError;
  }

  return optionalString(optionalRecord(firstError)?.message);
}

function normalizeUsageStats(payload: unknown): {
  teamId?: string;
  credits: {
    used?: number;
    limit?: number;
    remaining?: number;
  };
  endpoints: unknown[];
  usagePeriodStart?: string;
  usagePeriodEnd?: string;
  raw: Record<string, unknown>;
} {
  const record = requireObjectPayload(payload, "Apollo usage stats response");
  const creditsRecord = optionalRecord(record.credits) ?? {};

  return {
    teamId: optionalString(record.team_id),
    credits: {
      used: optionalNumber(creditsRecord.used),
      limit: optionalNumber(creditsRecord.limit),
      remaining: optionalNumber(creditsRecord.remaining),
    },
    endpoints: Array.isArray(record.endpoints) ? record.endpoints : [],
    usagePeriodStart: optionalString(record.usage_period_start),
    usagePeriodEnd: optionalString(record.usage_period_end),
    raw: record,
  };
}

function unwrapApolloEntity(payload: unknown, entityKey: string): Record<string, unknown> {
  const record = requireObjectPayload(payload, `Apollo ${entityKey} response`);
  const nested = optionalRecord(record[entityKey]);
  return nested ?? record;
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`, payload);
  }
  return record;
}

function requireInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value.map((item) => optionalString(item)).filter((item): item is string => !!item);
  return normalized.length > 0 ? normalized : undefined;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
