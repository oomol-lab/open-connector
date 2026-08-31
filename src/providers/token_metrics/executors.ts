import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "token_metrics";
const tokenMetricsApiBaseUrl = "https://api.tokenmetrics.com/v2";
const tokenMetricsValidationPath = "/tokens";

type TokenMetricsPhase = "validate" | "execute";
type TokenMetricsQueryValue = string | number | undefined;
type TokenMetricsActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<Record<string, unknown>>;

const tokenFilterKeys = ["token_id", "token_name", "symbol", "slug"];
const priceFilterKeys = ["token_id"];
const signalTokenFilterKeys = ["token_id", "symbol"];
const ohlcvTokenFilterKeys = ["token_id", "token_name", "symbol"];
const extendedFilterKeys = ["category", "exchange", "marketcap", "volume", "fdv"];
const paginationKeys = ["page", "limit"];
const dateRangeKeys = ["startDate", "endDate"];

export const tokenMetricsActionHandlers: ProviderActionHandlers<"token_metrics", TokenMetricsActionHandler> = {
  list_tokens(input, context) {
    return tokenMetricsGet(
      "/tokens",
      pickQuery(input, tokenFilterKeys, extendedFilterKeys, ["blockchain_address", "expand"], paginationKeys),
      context,
      "execute",
    );
  },
  get_prices(input, context) {
    return tokenMetricsGet("/price", pickQuery(input, priceFilterKeys), context, "execute");
  },
  list_top_market_cap_tokens(input, context) {
    return tokenMetricsGet("/top-market-cap-tokens", pickQuery(input, ["top_k", "page", "expand"]), context, "execute");
  },
  list_trading_signals(input, context) {
    return tokenMetricsGet(
      "/trading-signals",
      pickQuery(input, signalTokenFilterKeys, extendedFilterKeys, dateRangeKeys, ["signal"], paginationKeys),
      context,
      "execute",
    );
  },
  list_hourly_ohlcv(input, context) {
    return tokenMetricsGet(
      "/hourly-ohlcv",
      pickQuery(input, ohlcvTokenFilterKeys, dateRangeKeys, paginationKeys),
      context,
      "execute",
    );
  },
  list_daily_ohlcv(input, context) {
    return tokenMetricsGet(
      "/daily-ohlcv",
      pickQuery(input, ohlcvTokenFilterKeys, dateRangeKeys, paginationKeys),
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tokenMetricsActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tokenMetricsApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await tokenMetricsGet(
      tokenMetricsValidationPath,
      { limit: 1 },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    return {
      profile: {
        accountId: "api_key",
        displayName: "Token Metrics API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: tokenMetricsApiBaseUrl,
        validationEndpoint: tokenMetricsValidationPath,
      },
    };
  },
};

async function tokenMetricsGet(
  path: string,
  query: Record<string, TokenMetricsQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: TokenMetricsPhase,
): Promise<Record<string, unknown>> {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${tokenMetricsApiBaseUrl}/`);
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = optionalRecord(
      await readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: "Token Metrics returned invalid JSON",
      }),
    );
    if (!payload) {
      throw new ProviderRequestError(502, "Token Metrics returned an invalid response");
    }
    if (!response.ok || payload.success === false || payload.error !== undefined) {
      throw buildTokenMetricsError(phase, response.status, payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Token Metrics request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Token Metrics request failed: ${error.message}` : "Token Metrics request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function pickQuery(
  input: Record<string, unknown>,
  ...keyGroups: readonly (readonly string[])[]
): Record<string, TokenMetricsQueryValue> {
  const query: Record<string, TokenMetricsQueryValue> = {};
  for (const keys of keyGroups) {
    for (const key of keys) {
      const value = input[key];
      if (typeof value === "string" || typeof value === "number") {
        query[key] = value;
      }
    }
  }
  return query;
}

function buildTokenMetricsError(
  phase: TokenMetricsPhase,
  status: number,
  payload: Record<string, unknown>,
): ProviderRequestError {
  const message = extractTokenMetricsErrorMessage(payload) ?? `Token Metrics request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || (phase === "validate" && (status === 403 || status < 400))) {
    return new ProviderRequestError(401, message);
  }
  return new ProviderRequestError(status >= 500 || status < 400 ? 502 : status, message);
}

function extractTokenMetricsErrorMessage(payload: Record<string, unknown>): string | undefined {
  const directMessage = optionalString(payload.message) ?? optionalString(payload.error);
  return directMessage ?? optionalString(optionalRecord(payload.error)?.message);
}
