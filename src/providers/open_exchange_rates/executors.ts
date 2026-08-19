import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "open_exchange_rates";
const openExchangeRatesApiBaseUrl = "https://openexchangerates.org/api";

type OpenExchangeRatesQueryValue = boolean | string | undefined;
type OpenExchangeRatesActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const openExchangeRatesActionHandlers: ProviderActionHandlers<
  "open_exchange_rates",
  OpenExchangeRatesActionHandler
> = {
  get_currencies(_input, context) {
    return openExchangeRatesRequest({
      path: "/currencies.json",
      query: {},
      includeAppId: false,
      context,
    });
  },
  get_latest_rates(input, context) {
    return openExchangeRatesRequest({
      path: "/latest.json",
      query: buildRatesQuery(input),
      context,
    });
  },
  get_historical_rates(input, context) {
    return openExchangeRatesRequest({
      path: `/historical/${encodeURIComponent(readRequiredString(input.date, "date"))}.json`,
      query: buildRatesQuery(input),
      context,
    });
  },
  get_timeseries_rates(input, context) {
    const startDate = readRequiredString(input.startDate, "startDate");
    const endDate = readRequiredString(input.endDate, "endDate");
    if (startDate > endDate) {
      throw new ProviderRequestError(400, "startDate must be earlier than or equal to endDate");
    }

    return openExchangeRatesRequest({
      path: "/time-series.json",
      query: {
        start: startDate,
        end: endDate,
        ...buildRatesQuery(input),
      },
      context,
    });
  },
  convert_currency(input, context) {
    const amount = optionalNumber(input.amount);
    if (amount === undefined || amount <= 0) {
      throw new ProviderRequestError(400, "amount must be a positive number");
    }

    const from = readRequiredString(input.from, "from");
    const to = readRequiredString(input.to, "to");
    return openExchangeRatesRequest({
      path: `/convert/${encodeURIComponent(String(amount))}/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
      query: {},
      context,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, openExchangeRatesActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await openExchangeRatesRequest({
      path: "/latest.json",
      query: { symbols: "USD" },
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });

    return {
      profile: {
        accountId: "open_exchange_rates",
        displayName: "Open Exchange Rates App ID",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/latest.json",
        apiBaseUrl: openExchangeRatesApiBaseUrl,
      },
    };
  },
};

async function openExchangeRatesRequest(input: {
  path: string;
  query: Record<string, OpenExchangeRatesQueryValue>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  includeAppId?: boolean;
  phase?: "validate" | "execute";
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(
      buildOpenExchangeRatesUrl(input.path, input.query, input.context.apiKey, input.includeAppId),
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": providerUserAgent,
        },
        signal: input.context.signal,
      },
    );
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error
        ? `Open Exchange Rates request failed: ${error.message}`
        : "Open Exchange Rates request failed",
    );
  }

  const payload = await readOpenExchangeRatesPayload(response);
  if (!response.ok) {
    throw buildOpenExchangeRatesError(response.status, payload, input.phase ?? "execute");
  }

  if (isOpenExchangeRatesErrorPayload(payload)) {
    throw buildOpenExchangeRatesError(response.status, payload, input.phase ?? "execute");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Open Exchange Rates returned an invalid JSON response");
  }

  return payload;
}

function buildOpenExchangeRatesUrl(
  path: string,
  query: Record<string, OpenExchangeRatesQueryValue>,
  apiKey: string,
  includeAppId = true,
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${openExchangeRatesApiBaseUrl}/`);
  if (includeAppId) {
    url.searchParams.set("app_id", apiKey);
  }
  setSearchParams(url, stringifyQuery(query));
  return url;
}

async function readOpenExchangeRatesPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Open Exchange Rates returned an invalid JSON response");
  }
}

function buildOpenExchangeRatesError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message =
    extractOpenExchangeRatesErrorMessage(payload) ?? `Open Exchange Rates request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 401 || status === 403 || isOpenExchangeRatesClientError(payload)) {
    return new ProviderRequestError(phase === "validate" ? 400 : status || 401, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function isOpenExchangeRatesErrorPayload(payload: unknown): boolean {
  return optionalRecord(payload)?.error === true;
}

function isOpenExchangeRatesClientError(payload: unknown): boolean {
  const record = optionalRecord(payload);
  const status = optionalNumber(record?.status);
  if (status !== undefined && status >= 400 && status < 500) {
    return true;
  }

  const message = extractOpenExchangeRatesErrorMessage(payload);
  return message === "invalid_app_id" || message === "missing_app_id" || message === "not_allowed";
}

function extractOpenExchangeRatesErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.description) ?? optionalString(record.message) ?? optionalString(record.error);
}

function buildRatesQuery(input: Record<string, unknown>): Record<string, OpenExchangeRatesQueryValue> {
  return compactObject({
    base: optionalString(input.base),
    symbols: readOptionalSymbolsQuery(input.symbols),
    show_alternative: optionalBoolean(input.showAlternative),
  });
}

function readOptionalSymbolsQuery(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const symbols = value
    .map((item) => String(item).trim())
    .filter((item) => item !== "")
    .join(",");
  return symbols === "" ? undefined : symbols;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function stringifyQuery(input: Record<string, OpenExchangeRatesQueryValue>): Record<string, string | undefined> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = value === undefined ? undefined : String(value);
  }
  return output;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
