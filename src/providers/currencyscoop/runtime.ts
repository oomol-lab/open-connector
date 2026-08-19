import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type QueryValue = string | number | undefined;
type CurrencyscoopActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const currencyscoopApiBaseUrl = "https://api.currencybeacon.com/v1";

export const currencyscoopActionHandlers: ProviderActionHandlers<"currencyscoop", CurrencyscoopActionHandler> = {
  get_currencies(_input, context) {
    return executeGetCurrencies(context);
  },
  get_latest_rates(input, context) {
    return executeGetLatestRates(input, context);
  },
  get_historical_rates(input, context) {
    return executeGetHistoricalRates(input, context);
  },
  get_timeseries_rates(input, context) {
    return executeGetTimeseriesRates(input, context);
  },
  convert_currency(input, context) {
    return executeConvertCurrency(input, context);
  },
};

export async function validateCurrencyscoopCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  await currencyscoopRequest(
    {
      path: "/latest",
      query: {
        base: "USD",
        symbols: "EUR",
      },
    },
    { apiKey, fetcher, signal },
  );

  return {
    profile: {
      accountId: "api_key",
      displayName: "CurrencyBeacon API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: currencyscoopApiBaseUrl,
      validationEndpoint: "/latest",
    },
  };
}

async function executeGetCurrencies(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await currencyscoopRequest({ path: "/currencies" }, context);
  return {
    meta: normalizeMeta(payload.meta),
    currencies: readRequiredArray(payload.response, "response").map((item, index) =>
      normalizeCurrency(readRequiredObject(item, `response[${index}]`)),
    ),
  };
}

async function executeGetLatestRates(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await currencyscoopRequest(
    {
      path: "/latest",
      query: compactObject({
        base: readOptionalTrimmedString(input.base),
        symbols: readOptionalSymbolsQuery(input.symbols),
      }),
    },
    context,
  );
  return normalizeRatesPayload(payload);
}

async function executeGetHistoricalRates(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await currencyscoopRequest(
    {
      path: "/historical",
      query: compactObject({
        base: readOptionalTrimmedString(input.base),
        date: readRequiredTrimmedString(input.date, "date"),
        symbols: readOptionalSymbolsQuery(input.symbols),
      }),
    },
    context,
  );
  return normalizeRatesPayload(payload);
}

async function executeGetTimeseriesRates(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const startDate = readRequiredTrimmedString(input.startDate, "startDate");
  const endDate = readRequiredTrimmedString(input.endDate, "endDate");
  if (startDate > endDate) {
    throw new ProviderRequestError(400, "startDate must be earlier than or equal to endDate");
  }

  const payload = await currencyscoopRequest(
    {
      path: "/timeseries",
      query: compactObject({
        base: readOptionalTrimmedString(input.base),
        start_date: startDate,
        end_date: endDate,
        symbols: readOptionalSymbolsQuery(input.symbols),
      }),
    },
    context,
  );

  const response = readRequiredObject(payload.response, "response");
  return {
    meta: normalizeMeta(payload.meta),
    base: readRequiredString(response.base, "response.base"),
    startDate: readRequiredString(response.start_date, "response.start_date"),
    endDate: readRequiredString(response.end_date, "response.end_date"),
    ratesByDate: readNestedRatesRecord(response.rates, "response.rates"),
  };
}

async function executeConvertCurrency(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await currencyscoopRequest(
    {
      path: "/convert",
      query: compactObject({
        from: readRequiredTrimmedString(input.from, "from"),
        to: readRequiredTrimmedString(input.to, "to"),
        amount: readRequiredNumber(input.amount, "amount"),
        date: readOptionalTrimmedString(input.date),
      }),
    },
    context,
  );

  const response = readRequiredObject(payload.response, "response");
  return {
    meta: normalizeMeta(payload.meta),
    timestamp: readRequiredInteger(response.timestamp, "response.timestamp"),
    date: readRequiredString(response.date, "response.date"),
    from: readRequiredString(response.from, "response.from"),
    to: readRequiredString(response.to, "response.to"),
    amount: readRequiredNumber(response.amount, "response.amount"),
    value: readRequiredNumber(response.value, "response.value"),
  };
}

interface CurrencyscoopRequestInput {
  path: string;
  query?: Record<string, QueryValue>;
}

async function currencyscoopRequest(
  input: CurrencyscoopRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<{ meta: Record<string, unknown>; response: unknown }> {
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(buildCurrencyscoopUrl(input, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CurrencyBeacon request failed: ${error.message}` : "CurrencyBeacon request failed",
    );
  }

  if (!response.ok) {
    throw createCurrencyscoopError(response.status, payload);
  }

  const record = readRequiredObject(payload, "payload");
  return {
    meta: readRequiredObject(record.meta, "meta"),
    response: record.response,
  };
}

function buildCurrencyscoopUrl(input: CurrencyscoopRequestInput, apiKey: string): URL {
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, `${currencyscoopApiBaseUrl}/`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function createCurrencyscoopError(status: number, payload: unknown): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `CurrencyBeacon request failed with ${status || 500}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

async function readJsonPayload(response: Response): Promise<unknown> {
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

function normalizeMeta(value: unknown): Record<string, unknown> {
  const record = readRequiredObject(value, "meta");
  return compactObject({
    code: readRequiredInteger(record.code, "meta.code"),
    disclaimer: optionalString(record.disclaimer),
  });
}

function normalizeCurrency(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: readRequiredInteger(value.id, "currency.id"),
    code: readRequiredString(value.code, "currency.code"),
    shortCode: readRequiredString(value.short_code, "currency.short_code"),
    name: readRequiredString(value.name, "currency.name"),
    precision: readOptionalInteger(value.precision),
    subunit: readOptionalInteger(value.subunit),
    symbol: optionalString(value.symbol),
    symbolFirst: typeof value.symbol_first === "boolean" ? value.symbol_first : undefined,
    decimalMark: optionalString(value.decimal_mark),
    thousandsSeparator: optionalString(value.thousands_separator),
    countries: readOptionalStrictStringArray(value.countries, "currency.countries"),
  });
}

function normalizeRatesPayload(payload: { meta: Record<string, unknown>; response: unknown }): Record<string, unknown> {
  const response = readRequiredObject(payload.response, "response");
  return {
    meta: normalizeMeta(payload.meta),
    base: readRequiredString(response.base, "response.base"),
    date: readRequiredString(response.date, "response.date"),
    rates: readRatesRecord(response.rates, "response.rates"),
  };
}

function readOptionalSymbolsQuery(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value
    .map((item) => String(item).trim())
    .filter((item) => item !== "")
    .join(",");
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `CurrencyBeacon returned invalid ${fieldName}`);
  }
  return value as Record<string, unknown>;
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `CurrencyBeacon returned invalid ${fieldName}`);
  }
  return value;
}

function readRatesRecord(value: unknown, fieldName: string): Record<string, number> {
  const record = readRequiredObject(value, fieldName);
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => {
      if (!isCurrencyCodeKey(key)) {
        throw new ProviderRequestError(502, `CurrencyBeacon returned invalid ${fieldName}.${key}`);
      }
      return [key, readRequiredNumber(child, `${fieldName}.${key}`)];
    }),
  );
}

function readNestedRatesRecord(value: unknown, fieldName: string): Record<string, Record<string, number>> {
  const record = readRequiredObject(value, fieldName);
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => {
      if (!isIsoDateKey(key)) {
        throw new ProviderRequestError(502, `CurrencyBeacon returned invalid ${fieldName}.${key}`);
      }
      return [key, readRatesRecord(child, `${fieldName}.${key}`)];
    }),
  );
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  const normalized = readOptionalTrimmedString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim() || undefined;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(502, `CurrencyBeacon returned invalid ${fieldName}`);
  }
  return normalized;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const normalized = readOptionalNumber(value);
  if (normalized === undefined) {
    throw new ProviderRequestError(502, `CurrencyBeacon returned invalid ${fieldName}`);
  }
  return normalized;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const normalized = readOptionalInteger(value);
  if (normalized === undefined) {
    throw new ProviderRequestError(502, `CurrencyBeacon returned invalid ${fieldName}`);
  }
  return normalized;
}

function readOptionalInteger(value: unknown): number | undefined {
  const normalized = readOptionalNumber(value);
  return Number.isInteger(normalized) ? normalized : undefined;
}

function readOptionalStrictStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `CurrencyBeacon returned invalid ${fieldName}`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new ProviderRequestError(502, `CurrencyBeacon returned invalid ${fieldName}[${index}]`);
    }
    return item;
  });
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const directMessage =
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.description);
  if (directMessage) {
    return directMessage;
  }
  const errors = record.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (typeof item === "string" && item.trim() !== "") {
        return item;
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const child = item as Record<string, unknown>;
        const childMessage =
          optionalString(child.message) ?? optionalString(child.error) ?? optionalString(child.detail);
        if (childMessage) {
          return childMessage;
        }
      }
    }
  }
  return undefined;
}

function isCurrencyCodeKey(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isUppercaseLetter = code >= 65 && code <= 90;
    const isDigit = code >= 48 && code <= 57;
    const isUnderscore = code === 95;
    if (!isUppercaseLetter && !isDigit && !isUnderscore) {
      return false;
    }
  }
  return value.length > 0;
}

function isIsoDateKey(value: string): boolean {
  const parts = value.split("-");
  if (parts.length !== 3) {
    return false;
  }
  const [yearPart, monthPart, dayPart] = parts;
  if (yearPart?.length !== 4 || monthPart?.length !== 2 || dayPart?.length !== 2) {
    return false;
  }
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
