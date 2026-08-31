import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalNumber, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "coinmarketcap";
const coinmarketcapApiBaseUrl = "https://pro-api.coinmarketcap.com";

type CoinmarketcapRequestPhase = "validate" | "execute";
type CoinmarketcapActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface CoinmarketcapStatusPayload {
  error_code?: unknown;
  error_message?: unknown;
}

export const coinmarketcapActionHandlers: ProviderActionHandlers<"coinmarketcap", CoinmarketcapActionHandler> = {
  get_key_info(_input, context) {
    return coinmarketcapGet("/v1/key/info", {}, context, "execute");
  },
  get_cryptocurrency_map(input, context) {
    return coinmarketcapGet(
      "/v1/cryptocurrency/map",
      queryParams({
        id: optionalString(input.id),
        listing_status: optionalString(input.listing_status),
        slug: optionalString(input.slug),
        symbol: optionalString(input.symbol),
        aux: optionalString(input.aux),
        sort: optionalString(input.sort),
        start: optionalNumber(input.start),
        limit: optionalNumber(input.limit),
      }),
      context,
      "execute",
    );
  },
  get_latest_cryptocurrency_quotes(input, context) {
    assertExactlyOne(input, ["id", "symbol", "slug"]);
    assertMutuallyExclusive(input, "convert", "convert_id");
    return coinmarketcapGet(
      "/v1/cryptocurrency/quotes/latest",
      queryParams({
        id: optionalString(input.id),
        symbol: optionalString(input.symbol),
        slug: optionalString(input.slug),
        convert: optionalString(input.convert),
        convert_id: optionalString(input.convert_id),
        skip_invalid: optionalBoolean(input.skip_invalid),
        aux: optionalString(input.aux),
      }),
      context,
      "execute",
    );
  },
  list_latest_cryptocurrency_listings(input, context) {
    assertMutuallyExclusive(input, "convert", "convert_id");
    return coinmarketcapGet(
      "/v1/cryptocurrency/listings/latest",
      queryParams({
        start: optionalNumber(input.start),
        limit: optionalNumber(input.limit),
        price_min: optionalNumber(input.price_min),
        price_max: optionalNumber(input.price_max),
        market_cap_min: optionalNumber(input.market_cap_min),
        market_cap_max: optionalNumber(input.market_cap_max),
        volume_24h_min: optionalNumber(input.volume_24h_min),
        volume_24h_max: optionalNumber(input.volume_24h_max),
        circulating_supply_min: optionalNumber(input.circulating_supply_min),
        circulating_supply_max: optionalNumber(input.circulating_supply_max),
        percent_change_24h_min: optionalNumber(input.percent_change_24h_min),
        percent_change_24h_max: optionalNumber(input.percent_change_24h_max),
        convert: optionalString(input.convert),
        convert_id: optionalString(input.convert_id),
        sort: optionalString(input.sort),
        sort_dir: optionalString(input.sort_dir),
        cryptocurrency_type: optionalString(input.cryptocurrency_type),
        tag: optionalString(input.tag),
        aux: optionalString(input.aux),
      }),
      context,
      "execute",
    );
  },
  get_latest_global_metrics_quotes(input, context) {
    assertMutuallyExclusive(input, "convert", "convert_id");
    return coinmarketcapGet(
      "/v1/global-metrics/quotes/latest",
      queryParams({
        convert: optionalString(input.convert),
        convert_id: optionalString(input.convert_id),
      }),
      context,
      "execute",
    );
  },
  convert_price(input, context) {
    assertExactlyOne(input, ["id", "symbol"]);
    assertMutuallyExclusive(input, "convert", "convert_id");
    return coinmarketcapGet(
      "/v1/tools/price-conversion",
      queryParams({
        amount: readRequiredNumber(input.amount, "amount"),
        id: optionalNumber(input.id),
        symbol: optionalString(input.symbol),
        convert: optionalString(input.convert),
        convert_id: optionalString(input.convert_id),
        time: optionalString(input.time),
      }),
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, coinmarketcapActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await coinmarketcapGet("/v1/key/info", {}, context, "validate");
    const data = requiredRecord(
      requiredRecord(payload, "payload", providerResponseError).data,
      "data",
      providerResponseError,
    );
    const plan = optionalRecord(data.plan);
    return {
      profile: {
        displayName: "CoinMarketCap API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/key/info",
        apiBaseUrl: coinmarketcapApiBaseUrl,
        rate_limit_minute: optionalNumber(plan?.rate_limit_minute),
        credit_limit_monthly: optionalNumber(plan?.credit_limit_monthly),
      },
    };
  },
};

async function coinmarketcapGet(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
  phase: CoinmarketcapRequestPhase,
): Promise<Record<string, unknown>> {
  const response = await coinmarketcapFetch(path, query, context);
  const payload = await readCoinmarketcapPayload(response);
  const statusPayload = extractStatusPayload(payload);
  const errorCode = optionalNumber(statusPayload?.error_code) ?? 0;

  if (!response.ok || errorCode !== 0) {
    throw buildCoinmarketcapError(response.status, statusPayload, payload, phase);
  }

  return requiredRecord(payload, "payload", providerResponseError);
}

async function coinmarketcapFetch(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
): Promise<Response> {
  const url = new URL(path, `${coinmarketcapApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  try {
    return await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-CMC_PRO_API_KEY": context.apiKey,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CoinMarketCap request failed: ${error.message}` : "CoinMarketCap request failed",
    );
  }
}

async function readCoinmarketcapPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "CoinMarketCap returned an empty response");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "CoinMarketCap returned invalid JSON");
  }
}

function buildCoinmarketcapError(
  httpStatus: number,
  statusPayload: CoinmarketcapStatusPayload | undefined,
  payload: unknown,
  phase: CoinmarketcapRequestPhase,
): ProviderRequestError {
  const message =
    optionalString(statusPayload?.error_message) ?? `CoinMarketCap request failed with ${httpStatus || 500}`;
  if (httpStatus === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (httpStatus === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (httpStatus === 400 || httpStatus === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(httpStatus || 500, message, payload);
}

function extractStatusPayload(payload: unknown): CoinmarketcapStatusPayload | undefined {
  return optionalRecord(optionalRecord(payload)?.status) as CoinmarketcapStatusPayload | undefined;
}

function assertExactlyOne(input: Record<string, unknown>, fields: string[]): void {
  const present = fields.filter(
    (field) => optionalString(input[field]) !== undefined || optionalNumber(input[field]) !== undefined,
  );
  if (present.length !== 1) {
    throw new ProviderRequestError(400, `Exactly one of ${fields.join(", ")} is required.`);
  }
}

function assertMutuallyExclusive(input: Record<string, unknown>, left: string, right: string): void {
  if (optionalString(input[left]) !== undefined && optionalString(input[right]) !== undefined) {
    throw new ProviderRequestError(400, `${left} and ${right} cannot be used together.`);
  }
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a number`);
  }
  return value;
}
