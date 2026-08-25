import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const tripleWhaleApiBaseUrl = "https://api.triplewhale.com/api/v2/";
const tripleWhaleValidateApiKeyPath = "/users/api-keys/me";

type TripleWhaleRequestPhase = "validate" | "execute";
type TripleWhaleActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const tripleWhaleActionHandlers: ProviderActionHandlers<"triple_whale", TripleWhaleActionHandler> = {
  async validate_api_key(_input, context): Promise<unknown> {
    const payload = await requestTripleWhaleJson({
      path: tripleWhaleValidateApiKeyPath,
      method: "GET",
      context,
      phase: "execute",
    });

    return {
      valid: true,
      apiKey: normalizeObject(payload),
    };
  },
  async get_summary_page_data(input, context): Promise<unknown> {
    const payload = await requestTripleWhaleJson({
      path: "/summary-page/get-data",
      method: "POST",
      body: buildSummaryPageBody(input),
      context,
      phase: "execute",
    });

    return normalizeSummaryPagePayload(payload);
  },
  async execute_custom_sql_query(input, context): Promise<unknown> {
    const payload = await requestTripleWhaleJson({
      path: "/orcabase/api/sql",
      method: "POST",
      body: buildCustomSqlBody(input),
      context,
      phase: "execute",
    });

    return normalizeCustomSqlPayload(payload);
  },
  async get_customer_journey_attribution_data(input, context): Promise<unknown> {
    const payload = await requestTripleWhaleJson({
      path: "/attribution/get-orders-with-journeys-v2",
      method: "POST",
      body: buildCustomerJourneyBody(input),
      context,
      phase: "execute",
    });

    return normalizeCustomerJourneyPayload(payload);
  },
};

export async function validateTripleWhaleCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestTripleWhaleJson({
    path: tripleWhaleValidateApiKeyPath,
    method: "GET",
    context: {
      apiKey,
      fetcher,
      signal,
    },
    phase: "validate",
  });
  const apiKeyRecord = normalizeObject(payload);
  const apiKeyDescription = optionalString(apiKeyRecord.description);
  const apiKeyPrefix = optionalString(apiKeyRecord.prefix);
  const apiKeyScopes = readStringArray(apiKeyRecord.scopes);

  return {
    profile: {
      displayName: buildAccountLabel(apiKeyDescription, apiKeyPrefix),
      grantedScopes: apiKeyScopes,
    },
    grantedScopes: apiKeyScopes,
    metadata: compactObject({
      apiBaseUrl: tripleWhaleApiBaseUrl,
      validationEndpoint: tripleWhaleValidateApiKeyPath,
      apiKeyDescription,
      apiKeyPrefix,
      apiKeyScopes: apiKeyScopes.length > 0 ? apiKeyScopes : undefined,
    }),
  };
}

async function requestTripleWhaleJson(input: {
  path: string;
  method: "GET" | "POST";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: TripleWhaleRequestPhase;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const response = await requestTripleWhale(input);
  const payload = await readTripleWhalePayload(response);
  if (!response.ok) {
    throw createTripleWhaleError(response, payload, input.phase);
  }

  return payload;
}

async function requestTripleWhale(input: {
  path: string;
  method: "GET" | "POST";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, tripleWhaleApiBaseUrl);
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": input.context.apiKey,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  try {
    return await input.context.fetcher(url, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Triple Whale request failed: ${error.message}` : "Triple Whale request failed",
    );
  }
}

async function readTripleWhalePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTripleWhaleError(
  response: Response,
  payload: unknown,
  phase: TripleWhaleRequestPhase,
): ProviderRequestError {
  const message = extractTripleWhaleErrorMessage(payload) ?? response.statusText ?? "Triple Whale request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && [400, 401, 403].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && [401, 403].includes(response.status)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function buildSummaryPageBody(input: Record<string, unknown>): Record<string, unknown> {
  const period = requiredObject(input.period, "period");
  return {
    shopDomain: requiredTrimmedString(input.shopDomain, "shopDomain"),
    period: {
      start: requiredTrimmedString(period.start, "period.start"),
      end: requiredTrimmedString(period.end, "period.end"),
    },
    todayHour: optionalNumber(input.todayHour) ?? null,
  };
}

function buildCustomSqlBody(input: Record<string, unknown>): Record<string, unknown> {
  const period = requiredObject(input.period, "period");
  return compactObject({
    shopId: requiredTrimmedString(input.shopId, "shopId"),
    query: requiredTrimmedString(input.query, "query"),
    period: {
      startDate: requiredTrimmedString(period.startDate, "period.startDate"),
      endDate: requiredTrimmedString(period.endDate, "period.endDate"),
    },
    currency: optionalString(input.currency),
  });
}

function buildCustomerJourneyBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    shop: requiredTrimmedString(input.shop, "shop"),
    startDate: requiredTrimmedString(input.startDate, "startDate"),
    endDate: requiredTrimmedString(input.endDate, "endDate"),
    page: optionalNumber(input.page),
    pageSize: optionalNumber(input.pageSize),
    excludeJourneyData: optionalBoolean(input.excludeJourneyData),
  });
}

function normalizeSummaryPagePayload(payload: unknown): Record<string, unknown> {
  const record = normalizeObject(payload);
  return {
    metrics: objectArray(record.metrics, "metrics", providerResponseError),
    raw: record,
  };
}

function normalizeCustomSqlPayload(payload: unknown): Record<string, unknown> {
  const record = normalizeObject(payload);
  return {
    success: optionalBoolean(record.success) ?? null,
    message: optionalString(record.message) ?? null,
    data: objectArray(record.data, "data", providerResponseError),
    raw: record,
  };
}

function normalizeCustomerJourneyPayload(payload: unknown): Record<string, unknown> {
  const record = normalizeObject(payload);
  return {
    totalForRange: optionalNumber(record.totalForRange) ?? null,
    count: optionalNumber(record.count) ?? null,
    startDate: optionalString(record.startDate) ?? null,
    endDate: optionalString(record.endDate) ?? null,
    page: optionalNumber(record.page) ?? null,
    earliestDate: optionalString(record.earliestDate) ?? null,
    ordersWithJourneys: objectArray(record.ordersWithJourneys, "ordersWithJourneys", providerResponseError),
    raw: record,
  };
}

function normalizeObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Triple Whale returned invalid JSON");
  }

  return record;
}

function requiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const text = optionalString(item);
    return text ? [text] : [];
  });
}

function requiredTrimmedString(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (resolved) {
    return resolved;
  }

  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Triple Whale returned invalid ${message}`);
}

function buildAccountLabel(apiKeyDescription: string | undefined, apiKeyPrefix: string | undefined): string {
  if (apiKeyDescription) {
    return `Triple Whale ${apiKeyDescription}`;
  }

  if (apiKeyPrefix) {
    return `Triple Whale API Key ${apiKeyPrefix}`;
  }

  return "Triple Whale API Key";
}

function extractTripleWhaleErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}
