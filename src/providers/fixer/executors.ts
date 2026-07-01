import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FixerActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "fixer";
const fixerApiBaseUrl = "https://data.fixer.io/api";

type FixerQueryValue = string | undefined;
type FixerActionContext = ApiKeyProviderContext;
type FixerActionHandler = (input: Record<string, unknown>, context: FixerActionContext) => Promise<unknown>;

interface FixerRequestInput {
  path: string;
  query?: Record<string, FixerQueryValue>;
}

export const fixerActionHandlers: Record<FixerActionName, FixerActionHandler> = {
  get_supported_symbols(_input, context) {
    return fixerRequest(context, {
      path: "/symbols",
    });
  },
  get_latest_rates(input, context) {
    return fixerRequest(context, {
      path: "/latest",
      query: {
        base: readOptionalCurrencyCode(input.base, "base"),
        symbols: readOptionalSymbolsQuery(input.symbols),
      },
    });
  },
  get_historical_rates(input, context) {
    const date = readRequiredHistoricalDate(input.date);
    return fixerRequest(context, {
      path: `/${date}`,
      query: {
        base: readOptionalCurrencyCode(input.base, "base"),
        symbols: readOptionalSymbolsQuery(input.symbols),
      },
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fixerActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await fixerRequest(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: "/symbols",
      },
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "Fixer API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/symbols",
        apiBaseUrl: fixerApiBaseUrl,
      },
    };
  },
};

async function fixerRequest(context: FixerActionContext, input: FixerRequestInput): Promise<Record<string, unknown>> {
  const response = await fixerRawRequest(context, input);
  const payload = await readFixerPayload(response);

  if (!response.ok) {
    throw buildFixerError(response.status, payload);
  }

  if (isFixerErrorPayload(payload)) {
    throw buildFixerError(response.status, payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Fixer returned an invalid JSON response");
  }

  return record;
}

async function fixerRawRequest(context: FixerActionContext, input: FixerRequestInput): Promise<Response> {
  const url = new URL(resolveFixerPath(input.path), `${fixerApiBaseUrl}/`);
  url.searchParams.set("access_key", context.apiKey);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  try {
    return await context.fetcher(url, {
      method: "GET",
      headers: {
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Fixer request failed: ${error.message}` : "Fixer request failed",
      error,
    );
  }
}

function buildFixerError(status: number, payload: unknown): ProviderRequestError {
  const message = extractFixerErrorMessage(payload) ?? `Fixer request failed with ${status || 500}`;
  const errorType = extractFixerErrorType(payload);

  if (status === 429 || errorType === "monthly_limit_reached") {
    return new ProviderRequestError(429, message, payload);
  }

  if (
    errorType === "invalid_access_key" ||
    errorType === "missing_access_key" ||
    errorType === "base_currency_access_restricted" ||
    errorType === "invalid_base_currency" ||
    errorType === "invalid_symbols" ||
    errorType === "invalid_date"
  ) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

async function readFixerPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Fixer returned an invalid JSON response");
  }
}

function isFixerErrorPayload(payload: unknown): boolean {
  const record = optionalRecord(payload);
  return record ? record.success === false || record.error !== undefined : false;
}

function extractFixerErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return optionalString(error?.info) ?? optionalString(error?.type) ?? optionalString(record.message);
}

function extractFixerErrorType(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return optionalString(error?.type);
}

function readOptionalSymbolsQuery(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  return value.map((item, index) => readCurrencyCode(item, `symbols[${index}]`)).join(",");
}

function readOptionalCurrencyCode(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return readCurrencyCode(value, fieldName);
}

function readCurrencyCode(value: unknown, fieldName: string): string {
  const code = optionalString(value);
  if (!code) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  if (!isUppercaseAsciiCurrencyCode(code)) {
    throw new ProviderRequestError(400, `${fieldName} must use three uppercase ASCII letters`);
  }
  return code;
}

function readRequiredHistoricalDate(value: unknown): string {
  const date = optionalString(value);
  if (!date) {
    throw new ProviderRequestError(400, "date is required");
  }
  if (!isIsoDateString(date)) {
    throw new ProviderRequestError(400, "date must use YYYY-MM-DD format");
  }
  if (date > getTodayUtcIsoDateString()) {
    throw new ProviderRequestError(400, "date must not be in the future");
  }
  return date;
}

function isUppercaseAsciiCurrencyCode(value: string): boolean {
  if (value.length !== 3) {
    return false;
  }

  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) {
      return false;
    }
  }

  return true;
}

function isIsoDateString(value: string): boolean {
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
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function getTodayUtcIsoDateString(): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveFixerPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}
