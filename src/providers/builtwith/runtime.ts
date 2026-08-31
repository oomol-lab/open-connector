import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, runProviderRequest } from "../provider-runtime.ts";

const builtwithApiBaseUrl = "https://api.builtwith.com";
const builtwithValidationPath = "/whoamiv1/api.json";

type BuiltwithActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface BuiltwithErrorEntry {
  message: string;
  code?: number;
}

export const builtwithActionHandlers: ProviderActionHandlers<"builtwith", BuiltwithActionHandler> = {
  lookup_domain_profile(input, context) {
    return executeLookupDomainProfile(input, context);
  },
  lookup_domain_summary(input, context) {
    return executeLookupDomainSummary(input, context);
  },
  lookup_redirect_history(input, context) {
    return executeLookupRedirectHistory(input, context);
  },
  lookup_social_profiles(input, context) {
    return executeLookupSocialProfiles(input, context);
  },
  get_domain_recommendations(input, context) {
    return executeGetDomainRecommendations(input, context);
  },
};

export async function validateBuiltwithCredential(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  await builtwithRequest(
    {
      path: builtwithValidationPath,
    },
    input,
    "validate",
  );

  return {
    profile: {
      accountId: "builtwith_api_key",
      displayName: "BuiltWith API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: builtwithApiBaseUrl,
      validationEndpoint: builtwithValidationPath,
    },
  };
}

async function executeLookupDomainProfile(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await builtwithRequest(
    {
      path: "/v22/api.json",
      query: compactObject({
        LOOKUP: readRequiredTrimmedString(input.lookup, "lookup"),
        NOPII: "yes",
        NOMETA: input.includeMeta === true ? undefined : "yes",
        LIVEONLY: input.includeLiveOnly === true ? "yes" : undefined,
      }) as Record<string, string | undefined>,
    },
    context,
    "execute",
  );

  return normalizeDomainProfilePayload(payload);
}

async function executeLookupDomainSummary(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await builtwithRequest(
    {
      path: "/free1/api.json",
      query: {
        LOOKUP: readRequiredTrimmedString(input.lookup, "lookup"),
      },
    },
    context,
    "execute",
  );

  return normalizeDomainSummaryPayload(payload);
}

async function executeLookupRedirectHistory(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await builtwithRequest(
    {
      path: "/redirect1/api.json",
      query: {
        LOOKUP: readRequiredTrimmedString(input.lookup, "lookup"),
      },
    },
    context,
    "execute",
  );

  return normalizeRedirectHistoryPayload(payload);
}

async function executeLookupSocialProfiles(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await builtwithRequest(
    {
      path: "/social1/api.json",
      query: {
        LOOKUP: readRequiredTrimmedString(input.lookup, "lookup"),
      },
    },
    context,
    "execute",
  );

  return normalizeSocialLookupPayload(payload);
}

async function executeGetDomainRecommendations(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await builtwithRequest(
    {
      path: "/rec1/api.json",
      query: {
        LOOKUP: readRequiredTrimmedString(input.lookup, "lookup"),
      },
    },
    context,
    "execute",
  );

  return normalizeRecommendationsPayload(payload);
}

async function builtwithRequest(
  input: {
    path: string;
    query?: Record<string, string | undefined>;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "BuiltWith" }, async (signal) => {
    const response = await context.fetcher(buildBuiltwithUrl(input, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readBuiltwithPayload(response);

    if (!response.ok) {
      throw createBuiltwithError(response.status, payload, phase);
    }

    const errors = normalizeBuiltwithErrors(payload);
    if (errors.length > 0) {
      throw new ProviderRequestError(400, errors[0]!.message, payload);
    }

    return payload;
  });
}

function buildBuiltwithUrl(
  input: {
    path: string;
    query?: Record<string, string | undefined>;
  },
  apiKey: string,
): string {
  const url = new URL(input.path, builtwithApiBaseUrl);
  url.searchParams.set("KEY", apiKey);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function readBuiltwithPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      Message: text,
    };
  }
}

function createBuiltwithError(status: number, payload: unknown, _phase: "validate" | "execute"): ProviderRequestError {
  const message = extractBuiltwithErrorMessage(payload) ?? `BuiltWith request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403 || status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function extractBuiltwithErrorMessage(payload: unknown): string | undefined {
  const errors = normalizeBuiltwithErrors(payload);
  if (errors.length > 0) {
    return errors[0]!.message;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.Message) ?? optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  const nestedError = optionalRecord(record.error);
  return nestedError ? optionalString(nestedError.message) : undefined;
}

function normalizeBuiltwithErrors(payload: unknown): BuiltwithErrorEntry[] {
  const record = optionalRecord(payload);
  if (!record) {
    return [];
  }

  const rawErrors = Array.isArray(record.Errors) ? record.Errors : Array.isArray(record.errors) ? record.errors : [];
  const normalized: BuiltwithErrorEntry[] = [];
  for (const item of rawErrors) {
    const errorRecord = optionalRecord(item);
    if (!errorRecord) {
      continue;
    }

    const message =
      optionalString(errorRecord.Message) ?? optionalString(errorRecord.message) ?? optionalString(errorRecord.error);
    if (!message) {
      continue;
    }

    normalized.push(
      compactObject({
        message,
        code: optionalNumber(errorRecord.Code) ?? optionalNumber(errorRecord.code),
      }) as BuiltwithErrorEntry,
    );
  }

  return normalized;
}

function normalizeDomainProfilePayload(payload: unknown): Record<string, unknown> {
  const record = readRequiredObject(payload, "payload");
  return {
    results: readRequiredArray(record.Results, "Results").map((item, index) =>
      normalizeDomainProfileResult(readRequiredObject(item, `Results[${index}]`)),
    ),
    errors: normalizeBuiltwithErrors(record),
  };
}

function normalizeDomainProfileResult(record: Record<string, unknown>): Record<string, unknown> {
  const resultRecord = optionalRecord(record.Result);

  return compactObject({
    lookup: readRequiredString(record.Lookup, "Lookup"),
    firstIndexed: readRequiredNumber(record.FirstIndexed, "FirstIndexed"),
    lastIndexed: readRequiredNumber(record.LastIndexed, "LastIndexed"),
    salesRevenue: optionalNumber(record.SalesRevenue),
    isDb: optionalString(record.IsDB),
    spend: resultRecord ? optionalNumber(resultRecord.Spend) : undefined,
    spendHistory: resultRecord ? normalizeSpendHistory(resultRecord.SpendHistory) : undefined,
    paths: resultRecord ? normalizeDomainPaths(resultRecord.Paths) : [],
    meta: normalizeDomainMeta(record.Meta),
    attributes: normalizeNumericRecord(record.Attributes),
  }) as Record<string, unknown>;
}

function normalizeSpendHistory(value: unknown): Array<{ date: number; spend: number }> | undefined {
  return normalizeObjectArray(value)
    ?.map((item) => {
      const date = optionalNumber(item.D) ?? optionalNumber(item.date);
      const spend = optionalNumber(item.S) ?? optionalNumber(item.spend);
      if (date === undefined || spend === undefined) {
        return undefined;
      }

      return {
        date,
        spend,
      };
    })
    .filter((item): item is { date: number; spend: number } => item !== undefined);
}

function normalizeDomainPaths(value: unknown): Array<Record<string, unknown>> {
  return (
    normalizeObjectArray(value)?.map((item) => ({
      domain: readRequiredString(item.Domain, "Domain"),
      url: readRequiredString(item.Url, "Url"),
      subdomain: optionalString(item.SubDomain),
      firstIndexed: optionalNumber(item.FirstIndexed),
      lastIndexed: optionalNumber(item.LastIndexed),
      technologies: normalizeTechnologies(item.Technologies) ?? [],
    })) ?? []
  );
}

function normalizeTechnologies(value: unknown): Array<Record<string, unknown>> | undefined {
  return normalizeObjectArray(value)?.map(
    (item) =>
      compactObject({
        name: readRequiredString(item.Name, "Name"),
        description: optionalString(item.Description),
        link: optionalString(item.Link),
        parent: optionalString(item.Parent),
        tag: optionalString(item.Tag),
        categories: readOptionalStringArray(item.Categories),
        firstDetected: optionalNumber(item.FirstDetected),
        lastDetected: optionalNumber(item.LastDetected),
        isPremium: optionalString(item.IsPremium),
      }) as Record<string, unknown>,
  );
}

function normalizeDomainMeta(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    companyName: optionalString(record.CompanyName),
    country: optionalString(record.Country),
    state: optionalString(record.State),
    city: optionalString(record.City),
    postcode: optionalString(record.Postcode),
    vertical: optionalString(record.Vertical),
    majestic: optionalNumber(record.Majestic),
    aRank: optionalNumber(record.ARank),
    qRank: optionalNumber(record.QRank),
    umbrella: optionalNumber(record.Umbrella),
    social: readOptionalStringArray(record.Social),
  }) as Record<string, unknown>;
}

function normalizeNumericRecord(value: unknown): Record<string, number> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const entries = Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeDomainSummaryPayload(payload: unknown): Record<string, unknown> {
  const record = readRequiredObject(payload, "payload");
  return {
    domain: readRequiredString(record.domain, "domain"),
    firstIndexed: readRequiredNumber(record.first, "first"),
    lastIndexed: readRequiredNumber(record.last, "last"),
    groups:
      normalizeObjectArray(record.groups)?.map((item) => ({
        name: readRequiredString(item.name, "groups[].name"),
        live: readRequiredNumber(item.live, "groups[].live"),
        dead: readRequiredNumber(item.dead, "groups[].dead"),
        latest: readRequiredNumber(item.latest, "groups[].latest"),
        oldest: readRequiredNumber(item.oldest, "groups[].oldest"),
        categories:
          normalizeObjectArray(item.categories)?.map((category) => ({
            name: readRequiredString(category.name, "groups[].categories[].name"),
            live: readRequiredNumber(category.live, "groups[].categories[].live"),
            dead: readRequiredNumber(category.dead, "groups[].categories[].dead"),
            latest: readRequiredNumber(category.latest, "groups[].categories[].latest"),
            oldest: readRequiredNumber(category.oldest, "groups[].categories[].oldest"),
          })) ?? [],
      })) ?? [],
  };
}

function normalizeRedirectHistoryPayload(payload: unknown): Record<string, unknown> {
  const record = readRequiredObject(payload, "payload");
  return {
    lookup: readRequiredString(record.Lookup, "Lookup"),
    inbound: normalizeRedirectEntries(record.Inbound) ?? [],
    outbound: normalizeRedirectEntries(record.Outbound) ?? [],
  };
}

function normalizeRedirectEntries(value: unknown): Array<Record<string, string>> | undefined {
  return normalizeObjectArray(value)?.map((item) => ({
    domain: readRequiredString(item.Domain, "Domain"),
    firstDetected: readRequiredString(item.FirstDetected, "FirstDetected"),
    lastDetected: readRequiredString(item.LastDetected, "LastDetected"),
  }));
}

function normalizeSocialLookupPayload(payload: unknown): Record<string, unknown> {
  const record = readRequiredObject(payload, "payload");
  const socials = optionalRecord(record.Socials);
  return {
    socials:
      normalizeObjectArray(socials?.Social)?.map((item) => ({
        name: readRequiredString(item.Name, "Socials.Social[].Name"),
        results:
          normalizeObjectArray(item.Results)?.map((result) => ({
            socialUrl: readRequiredString(result.SocialUrl, "Results[].SocialUrl"),
            domains:
              normalizeObjectArray(result.Domains)?.map((domain) => ({
                root: readRequiredString(domain.Root, "Domains[].Root"),
                builtWithRank: readRequiredNumber(domain.BuiltWithRank, "Domains[].BuiltWithRank"),
              })) ?? [],
          })) ?? [],
      })) ?? [],
  };
}

function normalizeRecommendationsPayload(payload: unknown): Record<string, unknown> {
  const items = Array.isArray(payload)
    ? payload
    : (() => {
        const record = optionalRecord(payload);
        if (!record) {
          return [];
        }

        if (Array.isArray(record.Results)) {
          return record.Results;
        }

        if (optionalString(record.domain) || Array.isArray(record.tech)) {
          return [
            {
              Domain: record.domain,
              Compiled: record.compiled,
              Recommendations: record.tech,
            },
          ];
        }

        return [];
      })();

  return {
    results: items.map((item, index) => normalizeRecommendationResult(readRequiredObject(item, `results[${index}]`))),
  };
}

function normalizeRecommendationResult(record: Record<string, unknown>): Record<string, unknown> {
  const domain = optionalString(record.Domain) ?? optionalString(record.domain);
  if (!domain) {
    throw new ProviderRequestError(502, "BuiltWith returned invalid domain", record);
  }

  const recommendations = Array.isArray(record.Recommendations)
    ? record.Recommendations
    : Array.isArray(record.recommendations)
      ? record.recommendations
      : Array.isArray(record.tech)
        ? record.tech
        : [];

  return compactObject({
    domain,
    compiled: optionalString(record.Compiled) ?? optionalString(record.compiled),
    recommendations: recommendations.map((item, index) => {
      const recommendation = readRequiredObject(item, `recommendations[${index}]`);
      return {
        name: readRequiredString(recommendation.name, "recommendations[].name"),
        link: readRequiredString(recommendation.link, "recommendations[].link"),
        tag: readRequiredString(recommendation.tag, "recommendations[].tag"),
        categories: readOptionalStringArray(recommendation.categories) ?? [],
        stars: readRequiredNumber(recommendation.stars, "recommendations[].stars"),
        match: readRequiredNumber(recommendation.match, "recommendations[].match"),
      };
    }),
  }) as Record<string, unknown>;
}

function normalizeObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value)
    ? value.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => item !== undefined)
    : undefined;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `BuiltWith returned invalid ${fieldName}`, value);
  }
  return record;
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `BuiltWith returned invalid ${fieldName}`, value);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (text === undefined) {
    throw new ProviderRequestError(502, `BuiltWith returned invalid ${fieldName}`, value);
  }
  return text;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const number = optionalNumber(value);
  if (number === undefined) {
    throw new ProviderRequestError(502, `BuiltWith returned invalid ${fieldName}`, value);
  }
  return number;
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
}
