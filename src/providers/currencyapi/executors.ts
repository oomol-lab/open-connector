import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString, requiredRecord, stringArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "currencyapi";
const currencyapiApiBaseUrl = "https://api.currencyapi.com";

type QueryValue = string | number | undefined;
type CurrencyapiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const currencyapiActionHandlers: ProviderActionHandlers<"currencyapi", CurrencyapiActionHandler> = {
  get_api_status(_input, context) {
    return executeGetApiStatus(context);
  },
  get_supported_currencies(input, context) {
    return executeGetSupportedCurrencies(input, context);
  },
  get_latest_rates(input, context) {
    return executeGetLatestRates(input, context);
  },
  get_historical_rates(input, context) {
    return executeGetHistoricalRates(input, context);
  },
  convert_currency(input, context) {
    return executeConvertCurrency(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, currencyapiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await currencyapiRequest({ path: "/v3/status" }, { apiKey: input.apiKey, fetcher, signal });
    const accountId = readRequiredInteger(payload.account_id, "account_id");
    const quotas = normalizeQuotas(payload.quotas);
    return {
      profile: {
        accountId: String(accountId),
        displayName: "currencyapi API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: currencyapiApiBaseUrl,
        validationEndpoint: "/v3/status",
        accountId,
        quotas,
      },
    };
  },
};

async function executeGetApiStatus(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await currencyapiRequest({ path: "/v3/status" }, context);
  return {
    account_id: readRequiredInteger(payload.account_id, "account_id"),
    quotas: normalizeQuotas(payload.quotas),
  };
}

async function executeGetSupportedCurrencies(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await currencyapiRequest(
    {
      path: "/v3/currencies",
      query: compactObject({
        currencies: readOptionalCurrenciesQuery(input.currencies),
        type: optionalString(input.type),
      }),
    },
    context,
  );
  return { data: normalizeCurrencyMetadataRecord(payload.data) };
}

async function executeGetLatestRates(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await currencyapiRequest(
    {
      path: "/v3/latest",
      query: compactObject({
        base_currency: optionalString(input.base_currency),
        currencies: readOptionalCurrenciesQuery(input.currencies),
        type: optionalString(input.type),
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
  const payload = await currencyapiRequest(
    {
      path: "/v3/historical",
      query: compactObject({
        date: requiredInputString(input.date, "date"),
        base_currency: optionalString(input.base_currency),
        currencies: readOptionalCurrenciesQuery(input.currencies),
        type: optionalString(input.type),
      }),
    },
    context,
  );
  return normalizeRatesPayload(payload);
}

async function executeConvertCurrency(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await currencyapiRequest(
    {
      path: "/v3/convert",
      query: compactObject({
        value: readRequiredNumber(input.value, "value"),
        date: optionalString(input.date),
        base_currency: optionalString(input.base_currency),
        currencies: readOptionalCurrenciesQuery(input.currencies),
        type: optionalString(input.type),
      }),
    },
    context,
  );
  return normalizeRatesPayload(payload);
}

async function currencyapiRequest(
  input: { path: string; query?: Record<string, QueryValue> },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildCurrencyapiUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        apikey: context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `currencyapi request failed: ${error.message}` : "currencyapi request failed",
    );
  }

  if (!response.ok) {
    throw createCurrencyapiError(response.status, payload);
  }
  return readRequiredObject(payload, "payload");
}

function buildCurrencyapiUrl(input: { path: string; query?: Record<string, QueryValue> }): URL {
  const url = new URL(input.path, currencyapiApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

function createCurrencyapiError(status: number, payload: unknown): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `currencyapi request failed with ${status || 500}`;
  if (status === 401 || status === 422) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status, message, payload);
}

function normalizeQuotas(value: unknown): Record<string, unknown> {
  const quotas = readRequiredObject(value, "quotas");
  return {
    month: normalizeQuotaBucket(quotas.month, "quotas.month"),
    grace: normalizeQuotaBucket(quotas.grace, "quotas.grace"),
  };
}

function normalizeQuotaBucket(value: unknown, fieldName: string): Record<string, number> {
  const bucket = readRequiredObject(value, fieldName);
  return {
    total: readRequiredInteger(bucket.total, `${fieldName}.total`),
    used: readRequiredInteger(bucket.used, `${fieldName}.used`),
    remaining: readRequiredInteger(bucket.remaining, `${fieldName}.remaining`),
  };
}

function normalizeCurrencyMetadataRecord(value: unknown): Record<string, unknown> {
  const record = readRequiredObject(value, "data");
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      const metadata = readRequiredObject(item, `data.${key}`);
      return [
        key,
        {
          symbol: requiredProviderString(metadata.symbol, `data.${key}.symbol`),
          name: requiredProviderString(metadata.name, `data.${key}.name`),
          symbol_native: requiredProviderString(metadata.symbol_native, `data.${key}.symbol_native`),
          decimal_digits: readRequiredInteger(metadata.decimal_digits, `data.${key}.decimal_digits`),
          rounding: readRequiredNumber(metadata.rounding, `data.${key}.rounding`),
          code: requiredProviderString(metadata.code, `data.${key}.code`),
          name_plural: requiredProviderString(metadata.name_plural, `data.${key}.name_plural`),
          type: requiredProviderString(metadata.type, `data.${key}.type`),
          countries: readRequiredStringArray(metadata.countries, `data.${key}.countries`),
        },
      ];
    }),
  );
}

function normalizeRatesPayload(value: unknown): Record<string, unknown> {
  const payload = readRequiredObject(value, "payload");
  const meta = readRequiredObject(payload.meta, "meta");
  return {
    meta: { last_updated_at: requiredProviderString(meta.last_updated_at, "meta.last_updated_at") },
    data: normalizeRatesRecord(payload.data),
  };
}

function normalizeRatesRecord(value: unknown): Record<string, unknown> {
  const record = readRequiredObject(value, "data");
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      const rate = readRequiredObject(item, `data.${key}`);
      return [
        key,
        {
          code: requiredProviderString(rate.code, `data.${key}.code`),
          value: readRequiredNumber(rate.value, `data.${key}.value`),
        },
      ];
    }),
  );
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload.trim() || undefined;
  const record =
    typeof payload === "object" && payload != null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  const error =
    typeof record?.error === "object" && record.error != null && !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : undefined;
  return optionalString(record?.message) ?? optionalString(error?.message);
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, () => new ProviderRequestError(502, `${fieldName} must be an object`));
}

function requiredInputString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, `${fieldName} is required`);
  return value.trim();
}

function requiredProviderString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  return value;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new ProviderRequestError(502, `${fieldName} must be a number`);
  return value;
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${fieldName} must be an array`);
  return stringArray(value, fieldName, (message) => new ProviderRequestError(502, message));
}

function readOptionalCurrenciesQuery(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return stringArray(value, "currencies", (message) => new ProviderRequestError(400, message)).join(",");
}
