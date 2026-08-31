import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, nullableInteger, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredResponseRecord,
} from "../provider-runtime.ts";

type QueryValue = string | number | boolean | undefined;
type EodhdApisActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const service = "eodhd_apis";
const eodhdApisApiBaseUrl = "https://eodhd.com/api";

const eodhdApisActionHandlers: ProviderActionHandlers<"eodhd_apis", EodhdApisActionHandler> = {
  search_instruments(input, context) {
    return searchInstruments(input, context);
  },
  list_exchanges(_input, context) {
    return listExchanges(context);
  },
  get_real_time_quote(input, context) {
    return getRealTimeQuote(input, context);
  },
  get_eod(input, context) {
    return getEod(input, context);
  },
  get_id_mapping(input, context) {
    return getIdMapping(input, context);
  },
  get_macro_indicators(input, context) {
    return getMacroIndicators(input, context);
  },
  get_ust_yield_rates(input, context) {
    return getUstYieldRates(input, context);
  },
  get_user_info(_input, context) {
    return getUserInfo(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, eodhdApisActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = normalizeUser(await eodhdApisGet("/user", {}, input.apiKey, fetcher, signal));
    return {
      profile: {
        accountId: user.email ?? "eodhd-api-key",
        displayName: user.email ?? user.name ?? "EODHD API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: eodhdApisApiBaseUrl,
        validationEndpoint: "/user",
        subscriptionType: user.subscriptionType,
        apiRequests: user.apiRequests,
        dailyRateLimit: user.dailyRateLimit,
      }),
    };
  },
};

async function searchInstruments(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await eodhdApisGet(
    `/search/${encodeURIComponent(readRequiredString(input.query, "query"))}`,
    compactObject({
      fmt: "json",
      type: optionalString(input.type),
      exchange: optionalString(input.exchange),
      bonds_only: typeof input.bondsOnly === "boolean" ? boolToFlag(input.bondsOnly) : undefined,
      limit: optionalInteger(input.limit),
    }),
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    results: readObjectArray(payload, "payload"),
  };
}

async function listExchanges(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await eodhdApisGet(
    "/exchanges-list",
    { fmt: "json" },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    exchanges: readObjectArray(payload, "payload"),
  };
}

async function getRealTimeQuote(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await eodhdApisGet(
    `/real-time/${encodeURIComponent(readRequiredString(input.ticker, "ticker"))}`,
    compactObject({
      fmt: "json",
      s: readOptionalStringList(input.additionalTickers)?.join(","),
      ex: optionalString(input.exchange),
    }),
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    quotes: Array.isArray(payload)
      ? payload.map((item, index) => requiredResponseRecord(item, `payload[${index}]`))
      : [requiredResponseRecord(payload, "payload")],
  };
}

async function getEod(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await eodhdApisGet(
    `/eod/${encodeURIComponent(readRequiredString(input.ticker, "ticker"))}`,
    compactObject({
      fmt: "json",
      from: optionalString(input.dateFrom),
      to: optionalString(input.dateTo),
      period: optionalString(input.period),
      filter: optionalString(input.filter),
    }),
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  if (Array.isArray(payload)) {
    return {
      rows: payload.map((item, index) => requiredResponseRecord(item, `payload[${index}]`)),
      value: null,
      raw: null,
    };
  }

  if (typeof payload === "string" || typeof payload === "number") {
    return {
      rows: [],
      value: payload,
      raw: null,
    };
  }

  return {
    rows: [],
    value: null,
    raw: requiredResponseRecord(payload, "payload"),
  };
}

async function getIdMapping(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const query = compactObject({
    fmt: "json",
    "filter[symbol]": optionalString(input.filterSymbol),
    "filter[ex]": optionalString(input.filterExchange),
    "filter[isin]": optionalString(input.filterIsin),
    "filter[figi]": optionalString(input.filterFigi),
    "filter[lei]": optionalString(input.filterLei),
    "filter[cusip]": optionalString(input.filterCusip),
    "filter[cik]": optionalString(input.filterCik),
    "page[limit]": optionalInteger(input.pageLimit),
    "page[offset]": optionalInteger(input.pageOffset),
  });

  const hasFilter = Object.keys(query).some((key) => key.startsWith("filter["));
  if (!hasFilter) {
    throw new ProviderRequestError(400, "at least one identifier filter is required");
  }

  const payload = await eodhdApisGet("/id-mapping", query, context.apiKey, context.fetcher, context.signal);

  return {
    mappings: readObjectArray(payload, "payload"),
  };
}

async function getMacroIndicators(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await eodhdApisGet(
    `/macro-indicator/${encodeURIComponent(readRequiredString(input.country, "country").toUpperCase())}`,
    compactObject({
      fmt: "json",
      indicator: optionalString(input.indicator),
    }),
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    indicators: readObjectArray(payload, "payload"),
  };
}

async function getUstYieldRates(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await eodhdApisGet(
    "/ust/yield-rates",
    compactObject({
      fmt: "json",
      from: optionalString(input.dateFrom),
      to: optionalString(input.dateTo),
      "filter[year]": optionalInteger(input.filterYear),
      "page[limit]": optionalInteger(input.pageLimit),
      "page[offset]": optionalInteger(input.pageOffset),
    }),
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    rates: readObjectArray(payload, "payload"),
  };
}

async function getUserInfo(context: ApiKeyProviderContext): Promise<unknown> {
  return {
    user: normalizeUser(await eodhdApisGet("/user", {}, context.apiKey, context.fetcher, context.signal)),
  };
}

async function eodhdApisGet(
  path: string,
  query: Record<string, QueryValue>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = createProviderTimeout(signal);

  let response: Response;
  try {
    response = await fetcher(buildEodhdApisUrl(path, query, apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "EODHD APIs request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `EODHD APIs request failed: ${error.message}` : "EODHD APIs request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readEodhdApisPayload(response);
  if (!response.ok) {
    throw createEodhdApisError(response.status, payload);
  }

  const errorMessage = extractEodhdApisErrorMessage(payload);
  if (errorMessage) {
    throw createEodhdApisError(400, payload);
  }

  return payload;
}

function buildEodhdApisUrl(path: string, query: Record<string, QueryValue>, apiKey: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${eodhdApisApiBaseUrl}/`);
  url.searchParams.set("api_token", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readEodhdApisPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    throw new ProviderRequestError(502, "EODHD APIs returned an empty response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "EODHD APIs returned invalid JSON");
  }
}

function createEodhdApisError(status: number, payload: unknown): ProviderRequestError {
  const message = extractEodhdApisErrorMessage(payload) ?? `EODHD APIs request failed with status ${status}`;

  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (status >= 500) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status >= 400 ? status : 502, message);
}

function extractEodhdApisErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message);
  if (message) {
    return message;
  }

  const error = record.error;
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }

  const errorObject = optionalRecord(error);
  return optionalString(errorObject?.message);
}

function normalizeUser(payload: unknown): {
  name: string | null;
  email: string | null;
  subscriptionType: string | null;
  paymentMethod: string | null;
  apiRequests: number | null;
  apiRequestsDate: string | null;
  dailyRateLimit: number | null;
} {
  const record = requiredResponseRecord(payload, "payload");
  return {
    name: optionalString(record.name) ?? null,
    email: optionalString(record.email) ?? null,
    subscriptionType: optionalString(record.subscriptionType) ?? null,
    paymentMethod: optionalString(record.paymentMethod) ?? null,
    apiRequests: nullableInteger(record.apiRequests) ?? null,
    apiRequestsDate: optionalString(record.apiRequestsDate) ?? null,
    dailyRateLimit: nullableInteger(record.dailyRateLimit) ?? null,
  };
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((item, index) => requiredResponseRecord(item, `${fieldName}[${index}]`));
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function readOptionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item !== "");
  return values.length > 0 ? values : undefined;
}

function boolToFlag(value: boolean): number {
  return value ? 1 : 0;
}
