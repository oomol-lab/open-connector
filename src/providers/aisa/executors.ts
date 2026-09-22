import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "aisa";
const apiOrigin = "https://api.aisa.one";
type Phase = "validate" | "execute";
interface Route {
  path: string;
  query: Record<string, string>;
}
const routes: Record<string, Route> = {
  get_credits_balance: { path: "/v1/credits/balance", query: {} },
  get_usage: { path: "/v1/usage", query: { startTimestamp: "start_time", endTimestamp: "end_time" } },
  get_kalshi_markets: {
    path: "/apis/v1/kalshi/markets",
    query: {
      tickers: "tickers",
      eventTicker: "event_ticker",
      seriesTicker: "series_ticker",
      search: "search",
      status: "status",
      limit: "limit",
      cursor: "cursor",
      minCreatedTimestamp: "min_created_ts",
      maxCreatedTimestamp: "max_created_ts",
      minUpdatedTimestamp: "min_updated_ts",
      minCloseTimestamp: "min_close_ts",
      maxCloseTimestamp: "max_close_ts",
      minSettledTimestamp: "min_settled_ts",
      maxSettledTimestamp: "max_settled_ts",
      multivariateEventFilter: "mve_filter",
    },
  },
  get_kalshi_trades: {
    path: "/apis/v1/kalshi/trades",
    query: {
      limit: "limit",
      cursor: "cursor",
      ticker: "ticker",
      minTimestamp: "min_ts",
      maxTimestamp: "max_ts",
      isBlockTrade: "is_block_trade",
    },
  },
  get_polymarket_markets: {
    path: "/apis/v1/polymarket/markets",
    query: {
      limit: "limit",
      offset: "offset",
      order: "order",
      ascending: "ascending",
      ids: "id",
      slugs: "slug",
      clobTokenIds: "clob_token_ids",
      conditionIds: "condition_ids",
      minVolume: "volume_num_min",
      maxVolume: "volume_num_max",
      minStartDate: "start_date_min",
      maxStartDate: "start_date_max",
      minEndDate: "end_date_min",
      maxEndDate: "end_date_max",
      tagId: "tag_id",
      closed: "closed",
      includeTag: "include_tag",
    },
  },
  get_polymarket_events: {
    path: "/apis/v1/polymarket/events",
    query: {
      limit: "limit",
      offset: "offset",
      order: "order",
      ascending: "ascending",
      ids: "id",
      slugs: "slug",
      tagId: "tag_id",
      tagSlug: "tag_slug",
      active: "active",
      archived: "archived",
      featured: "featured",
      closed: "closed",
      minLiquidity: "liquidity_min",
      maxLiquidity: "liquidity_max",
      minVolume: "volume_min",
      maxVolume: "volume_max",
      minStartDate: "start_date_min",
      maxStartDate: "start_date_max",
      minEndDate: "end_date_min",
      maxEndDate: "end_date_max",
    },
  },
  get_polymarket_activity: {
    path: "/apis/v1/polymarket/activity",
    query: {
      user: "user",
      startTimestamp: "start_time",
      endTimestamp: "end_time",
      marketSlug: "market_slug",
      conditionId: "condition_id",
      limit: "limit",
      paginationKey: "pagination_key",
    },
  },
};
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: ProviderActionHandlers<"aisa", Handler> = Object.fromEntries(
  Object.entries(routes).map(([name, route]) => [
    name,
    (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
      requestJson(route.path, buildQuery(input, route.query), context, "execute"),
  ]),
) as ProviderActionHandlers<"aisa", Handler>;

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiOrigin,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestJson(
      "/v1/credits/balance",
      new URLSearchParams(),
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    if (!optionalRecord(payload)) throw providerResponseError("AIsa balance response must be an object");
    return {
      profile: { accountId: "aisa-api-key", displayName: "AIsa API Key" },
      grantedScopes: [],
      metadata: { apiOrigin },
    };
  },
};

function buildQuery(input: Record<string, unknown>, mapping: Record<string, string>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [inputName, queryName] of Object.entries(mapping)) {
    const value = input[inputName];
    if (value == null) continue;
    if (Array.isArray(value)) for (const item of value) query.append(queryName, String(item));
    else query.set(queryName, String(value));
  }
  return query;
}

async function requestJson(
  path: string,
  query: URLSearchParams,
  context: ApiKeyProviderContext,
  phase: Phase,
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "AIsa" }, async (signal) => {
    const url = new URL(path, apiOrigin);
    url.search = query.toString();
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "AIsa returned invalid JSON",
    });
    if (!response.ok) throw createError(response.status, payload, phase);
    return payload;
  });
}

function createError(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  const code = optionalString(error?.code);
  const message =
    optionalString(error?.message) ?? optionalString(record?.message) ?? `AIsa request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 402) return new ProviderRequestError(402, message, payload);
  if (isCredentialError(code))
    return phase === "validate" ? providerInputError(message) : new ProviderRequestError(409, message, payload);
  if ([400, 404, 422].includes(status)) return providerInputError(message);
  return new ProviderRequestError(status || 502, message, payload);
}

function isCredentialError(code: string | undefined): boolean {
  return code === "missing_api_key" || code === "invalid_api_key" || code === "revoked_api_key";
}
