import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { AhrefsActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const ahrefsApiBaseUrl = "https://api.ahrefs.com/v3";

const limitsAndUsagePath = "/subscription-info/limits-and-usage";

type AhrefsPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;
type AhrefsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const ahrefsActionHandlers: Record<AhrefsActionName, AhrefsActionHandler> = {
  get_limits_and_usage(_input, context) {
    return requestAhrefs(limitsAndUsagePath, {}, context.apiKey, context.fetcher, context.signal, "execute");
  },
  get_site_explorer_metrics(input, context) {
    return requestAhrefs(
      "/site-explorer/metrics",
      buildSiteExplorerMetricsQuery(input),
      context.apiKey,
      context.fetcher,
      context.signal,
      "execute",
    );
  },
  get_site_explorer_metrics_by_country(input, context) {
    return requestAhrefs(
      "/site-explorer/metrics-by-country",
      buildSiteExplorerMetricsByCountryQuery(input),
      context.apiKey,
      context.fetcher,
      context.signal,
      "execute",
    );
  },
  get_keywords_overview(input, context) {
    return requestAhrefs(
      "/keywords-explorer/overview",
      buildKeywordsOverviewQuery(input),
      context.apiKey,
      context.fetcher,
      context.signal,
      "execute",
    );
  },
};

export async function validateAhrefsCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestAhrefs(limitsAndUsagePath, {}, apiKey, fetcher, signal, "validate");
  const data = optionalRecord(optionalRecord(payload)?.data);
  const record = data ? optionalRecord(data.limits_and_usage) : undefined;

  return {
    profile: {
      displayName: "Ahrefs API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: ahrefsApiBaseUrl,
      validationEndpoint: limitsAndUsagePath,
      subscription: record ? optionalString(record.subscription) : undefined,
      apiKeyExpirationDate: record ? optionalString(record.api_key_expiration_date) : undefined,
      unitsLimitApiKey: record ? optionalNumber(record.units_limit_api_key) : undefined,
      unitsLimitWorkspace: record ? optionalNumber(record.units_limit_workspace) : undefined,
      unitsUsageApiKey: record ? optionalNumber(record.units_usage_api_key) : undefined,
      unitsUsageWorkspace: record ? optionalNumber(record.units_usage_workspace) : undefined,
      usageResetDate: record ? optionalString(record.usage_reset_date) : undefined,
    }),
  };
}

async function requestAhrefs(
  path: string,
  query: Record<string, QueryValue>,
  apiKey: string,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
  phase: AhrefsPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;

  try {
    response = await fetcher(buildAhrefsUrl(path, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Ahrefs request failed: ${error.message}` : "Ahrefs request failed",
    );
  }

  if (!response.ok) {
    throw createAhrefsError(response.status, payload, phase);
  }

  return normalizeAhrefsPayload(payload);
}

function buildAhrefsUrl(path: string, query: Record<string, QueryValue>): string {
  const url = new URL(`${ahrefsApiBaseUrl}${path}`);
  url.searchParams.set("output", "json");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildSiteExplorerMetricsQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    target: requiredString(input.target, "target"),
    date: requiredString(input.date, "date"),
    mode: readOptionalString(input.mode),
    country: readOptionalString(input.country),
    protocol: readOptionalString(input.protocol),
    volume_mode: readOptionalString(input.volumeMode),
  });
}

function buildSiteExplorerMetricsByCountryQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    target: requiredString(input.target, "target"),
    date: requiredString(input.date, "date"),
    mode: readOptionalString(input.mode),
    select: readOptionalString(input.select),
    protocol: readOptionalString(input.protocol),
    volume_mode: readOptionalString(input.volumeMode),
  });
}

function buildKeywordsOverviewQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    country: requiredString(input.country, "country"),
    select: requiredString(input.select, "select"),
    keywords: readOptionalString(input.keywords),
    target: readOptionalString(input.target),
    target_mode: readOptionalString(input.targetMode),
    target_position: readOptionalString(input.targetPosition),
    keyword_list_id: readOptionalInteger(input.keywordListId, "keywordListId"),
    volume_monthly_date_from: readOptionalString(input.volumeMonthlyDateFrom),
    volume_monthly_date_to: readOptionalString(input.volumeMonthlyDateTo),
    where: readOptionalString(input.where),
    order_by: readOptionalString(input.orderBy),
    limit: readOptionalInteger(input.limit, "limit"),
    timeout: readOptionalInteger(input.timeout, "timeout"),
  });
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Ahrefs returned invalid JSON");
  }
}

function normalizeAhrefsPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (record && Object.hasOwn(record, "data")) {
    return {
      data: record.data,
    };
  }

  return {
    data: payload,
  };
}

function createAhrefsError(status: number, payload: unknown, phase: AhrefsPhase): ProviderRequestError {
  const message = extractAhrefsMessage(payload) ?? `Ahrefs request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && [400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function extractAhrefsMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (typeof item === "string" && item.trim()) {
        return item;
      }
      const itemRecord = optionalRecord(item);
      const itemMessage = itemRecord
        ? (optionalString(itemRecord.message) ?? optionalString(itemRecord.detail))
        : undefined;
      if (itemMessage) {
        return itemMessage;
      }
    }
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

function requiredString(value: unknown, fieldName: string): string {
  const text = readOptionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readOptionalString(value: unknown): string | undefined {
  const text = optionalString(value);
  return text || undefined;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  if (value < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be greater than or equal to 1`);
  }
  return value;
}
