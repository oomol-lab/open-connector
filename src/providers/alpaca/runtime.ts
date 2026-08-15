import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { readAlpacaGrantedScopes } from "./scopes.ts";

const paperTradingBaseUrl = "https://paper-api.alpaca.markets";
const liveTradingBaseUrl = "https://api.alpaca.markets";
const dataBaseUrl = "https://data.alpaca.markets";
const requestTimeoutMs = 30_000;

type Environment = "paper" | "live";
type ApiFamily = "trading" | "data";
type Phase = "validate" | "execute";

export interface ApiKeyCredential {
  authType: "api_key";
  apiKeyId: string;
  apiSecretKey: string;
  environment: Environment;
}

export interface OAuthCredential {
  authType: "oauth2";
  accessToken: string;
  tokenType: string;
  environment: Environment;
}

export type Credential = ApiKeyCredential | OAuthCredential;

export interface ActionContext {
  credential: Credential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

export const alpacaActionHandlers: Record<string, ActionHandler> = {
  async get_account(_input, context) {
    return {
      account: await requestAlpacaJson({
        family: "trading",
        path: "/v2/account",
        query: {},
        context,
        phase: "execute",
      }),
    };
  },
  async list_assets(input, context) {
    const payload = await requestAlpacaJson({
      family: "trading",
      path: "/v2/assets",
      query: compactObject({
        status: optionalString(input.status),
        asset_class: optionalString(input.assetClass),
        attributes: optionalStringList(input.attributes),
      }),
      context,
      phase: "execute",
    });

    return { assets: arrayPayload(payload, "assets") };
  },
  async get_asset(input, context) {
    return {
      asset: await requestAlpacaJson({
        family: "trading",
        path: `/v2/assets/${encodeURIComponent(requiredInputString(input.symbolOrAssetId, "symbolOrAssetId"))}`,
        query: {},
        context,
        phase: "execute",
      }),
    };
  },
  async list_positions(_input, context) {
    const payload = await requestAlpacaJson({
      family: "trading",
      path: "/v2/positions",
      query: {},
      context,
      phase: "execute",
    });

    return { positions: arrayPayload(payload, "positions") };
  },
  async get_position(input, context) {
    return {
      position: await requestAlpacaJson({
        family: "trading",
        path: `/v2/positions/${encodeURIComponent(requiredInputString(input.symbolOrAssetId, "symbolOrAssetId"))}`,
        query: {},
        context,
        phase: "execute",
      }),
    };
  },
  async list_orders(input, context) {
    const payload = await requestAlpacaJson({
      family: "trading",
      path: "/v2/orders",
      query: compactObject({
        status: optionalString(input.status),
        limit: optionalNumberString(input.limit),
        after: optionalString(input.after),
        until: optionalString(input.until),
        direction: optionalString(input.direction),
        nested: optionalBooleanString(input.nested),
        symbols: optionalStringList(input.symbols),
      }),
      context,
      phase: "execute",
    });

    return { orders: arrayPayload(payload, "orders") };
  },
  async get_order(input, context) {
    const clientOrderId = optionalString(input.clientOrderId);
    const request = clientOrderId
      ? {
          path: "/v2/orders:by_client_order_id",
          query: { client_order_id: clientOrderId },
        }
      : {
          path: `/v2/orders/${encodeURIComponent(requiredInputString(input.orderId, "orderId"))}`,
          query: {},
        };

    return {
      order: await requestAlpacaJson({
        family: "trading",
        path: request.path,
        query: request.query,
        context,
        phase: "execute",
      }),
    };
  },
  async get_market_clock(_input, context) {
    return {
      clock: await requestAlpacaJson({
        family: "trading",
        path: "/v2/clock",
        query: {},
        context,
        phase: "execute",
      }),
    };
  },
  async list_watchlists(_input, context) {
    const payload = await requestAlpacaJson({
      family: "trading",
      path: "/v2/watchlists",
      query: {},
      context,
      phase: "execute",
    });

    return { watchlists: arrayPayload(payload, "watchlists") };
  },
  async get_watchlist(input, context) {
    const name = optionalString(input.name);
    const request = name
      ? {
          path: "/v2/watchlists:by_name",
          query: { name },
        }
      : {
          path: `/v2/watchlists/${encodeURIComponent(requiredInputString(input.watchlistId, "watchlistId"))}`,
          query: {},
        };

    return {
      watchlist: await requestAlpacaJson({
        family: "trading",
        path: request.path,
        query: request.query,
        context,
        phase: "execute",
      }),
    };
  },
  async list_account_activities(input, context) {
    const payload = await requestAlpacaJson({
      family: "trading",
      path: "/v2/account/activities",
      query: compactObject({
        activity_types: optionalStringList(input.activityTypes),
        category: optionalString(input.category),
        date: optionalString(input.date),
        after: optionalString(input.after),
        until: optionalString(input.until),
        direction: optionalString(input.direction),
        page_size: optionalNumberString(input.pageSize),
        page_token: optionalString(input.pageToken),
      }),
      context,
      phase: "execute",
    });

    return { activities: arrayPayload(payload, "activities") };
  },
  async get_account_config(_input, context) {
    return {
      configuration: await requestAlpacaJson({
        family: "trading",
        path: "/v2/account/configurations",
        query: {},
        context,
        phase: "execute",
      }),
    };
  },
  async get_account_portfolio_history(input, context) {
    return {
      portfolioHistory: await requestAlpacaJson({
        family: "trading",
        path: "/v2/account/portfolio/history",
        query: compactObject({
          period: optionalString(input.period),
          timeframe: optionalString(input.timeframe),
          intraday_reporting: optionalString(input.intradayReporting),
          start: optionalString(input.start),
          end: optionalString(input.end),
          pnl_reset: optionalString(input.pnlReset),
          cashflow_types: optionalStringList(input.cashflowTypes),
        }),
        context,
        phase: "execute",
      }),
    };
  },
  async get_market_calendar(input, context) {
    const payload = await requestAlpacaJson({
      family: "trading",
      path: "/v2/calendar",
      query: compactObject({
        start: optionalString(input.start),
        end: optionalString(input.end),
        date_type: optionalString(input.dateType),
      }),
      context,
      phase: "execute",
    });

    return { calendar: arrayPayload(payload, "calendar") };
  },
  async list_corporate_actions(input, context) {
    const payload = await requestAlpacaJson({
      family: "data",
      path: "/v1/corporate-actions",
      query: compactObject({
        symbols: optionalStringList(input.symbols),
        cusips: optionalStringList(input.cusips),
        types: optionalStringList(input.types),
        region: optionalString(input.region),
        start: optionalString(input.start),
        end: optionalString(input.end),
        ids: optionalStringList(input.ids),
        limit: optionalNumberString(input.limit),
        page_token: optionalString(input.pageToken),
        sort: optionalString(input.sort),
      }),
      context,
      phase: "execute",
    });

    return normalizeCorporateActionsPayload(payload);
  },
  async get_stock_bars(input, context) {
    const payload = await requestAlpacaJson({
      family: "data",
      path: "/v2/stocks/bars",
      query: compactObject({
        symbols: stringList(input.symbols, "symbols"),
        timeframe: requiredInputString(input.timeframe, "timeframe"),
        start: optionalString(input.start),
        end: optionalString(input.end),
        limit: optionalNumberString(input.limit),
        adjustment: optionalString(input.adjustment),
        feed: optionalString(input.feed),
        sort: optionalString(input.sort),
        page_token: optionalString(input.pageToken),
        asof: optionalString(input.asof),
        currency: optionalString(input.currency),
      }),
      context,
      phase: "execute",
    });

    return normalizeBarsPayload(payload);
  },
  async get_crypto_bars(input, context) {
    const location = optionalString(input.location) ?? "us";
    const payload = await requestAlpacaJson({
      family: "data",
      path: `/v1beta3/crypto/${encodeURIComponent(location)}/bars`,
      query: compactObject({
        symbols: stringList(input.symbols, "symbols"),
        timeframe: requiredInputString(input.timeframe, "timeframe"),
        start: optionalString(input.start),
        end: optionalString(input.end),
        limit: optionalNumberString(input.limit),
        sort: optionalString(input.sort),
        page_token: optionalString(input.pageToken),
      }),
      context,
      phase: "execute",
    });

    return normalizeBarsPayload(payload);
  },
  async list_option_contracts(input, context) {
    const payload = await requestAlpacaJson({
      family: "trading",
      path: "/v2/options/contracts",
      query: compactObject({
        underlying_symbols: optionalStringList(input.underlyingSymbols),
        show_deliverables: optionalBooleanString(input.showDeliverables),
        status: optionalString(input.status),
        expiration_date: optionalString(input.expirationDate),
        expiration_date_gte: optionalString(input.expirationDateGte),
        expiration_date_lte: optionalString(input.expirationDateLte),
        root_symbol: optionalString(input.rootSymbol),
        type: optionalString(input.type),
        style: optionalString(input.style),
        strike_price_gte: optionalNumberString(input.strikePriceGte),
        strike_price_lte: optionalNumberString(input.strikePriceLte),
        page_token: optionalString(input.pageToken),
        limit: optionalNumberString(input.limit),
        ppind: optionalBooleanString(input.ppind),
      }),
      context,
      phase: "execute",
    });

    return normalizeOptionContractsPayload(payload);
  },
  async get_option_contract(input, context) {
    return {
      optionContract: await requestAlpacaJson({
        family: "trading",
        path: `/v2/options/contracts/${encodeURIComponent(requiredInputString(input.symbolOrId, "symbolOrId"))}`,
        query: {},
        context,
        phase: "execute",
      }),
    };
  },
  async get_stock_snapshots(input, context) {
    const payload = await requestAlpacaJson({
      family: "data",
      path: "/v2/stocks/snapshots",
      query: compactObject({
        symbols: stringList(input.symbols, "symbols"),
        feed: optionalString(input.feed),
        currency: optionalString(input.currency),
      }),
      context,
      phase: "execute",
    });

    return normalizeSnapshotsPayload(payload);
  },
  async get_crypto_snapshots(input, context) {
    const location = optionalString(input.location) ?? "us";
    const payload = await requestAlpacaJson({
      family: "data",
      path: `/v1beta3/crypto/${encodeURIComponent(location)}/snapshots`,
      query: compactObject({
        symbols: stringList(input.symbols, "symbols"),
      }),
      context,
      phase: "execute",
    });

    return normalizeSnapshotsPayload(payload);
  },
  async list_news(input, context) {
    const payload = await requestAlpacaJson({
      family: "data",
      path: "/v1beta1/news",
      query: compactObject({
        symbols: optionalStringList(input.symbols),
        limit: optionalNumberString(input.limit),
        include_content: optionalBooleanString(input.includeContent),
        exclude_contentless: optionalBooleanString(input.excludeContentless),
        start: optionalString(input.start),
        end: optionalString(input.end),
        sort: optionalString(input.sort),
        page_token: optionalString(input.pageToken),
      }),
      context,
      phase: "execute",
    });

    return normalizeNewsPayload(payload);
  },
};

export async function validateAlpacaCredential(
  input: { apiKey: string; apiKeyId: unknown; environment: unknown },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = readAlpacaCredential(input);
  return validateResolvedAlpacaCredential(credential, [], credential.apiKeyId, "Alpaca API Key", fetcher, signal);
}

export async function validateAlpacaOAuthCredential(
  input: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const grantedScopes = readAlpacaGrantedScopes(input.metadata.scope);
  let authorizationError: ProviderRequestError | undefined;

  for (const environment of ["live", "paper"] as const) {
    const credential = readAlpacaOAuthCredential(input, environment);
    try {
      return await validateResolvedAlpacaCredential(
        credential,
        grantedScopes,
        `alpaca:${environment}`,
        `Alpaca ${environment}`,
        fetcher,
        signal,
        "execute",
      );
    } catch (error) {
      if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
        authorizationError = error;
        continue;
      }
      throw error;
    }
  }

  throw new ProviderRequestError(
    400,
    authorizationError?.message ?? "Alpaca OAuth token cannot access a live or paper account",
    authorizationError?.details,
  );
}

async function validateResolvedAlpacaCredential(
  credential: Credential,
  grantedScopes: string[],
  fallbackAccountId: string,
  fallbackDisplayName: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  phase: Phase = "validate",
): Promise<CredentialValidationResult> {
  const payload = await requestAlpacaJson({
    family: "trading",
    path: "/v2/account",
    query: {},
    context: {
      credential,
      fetcher,
      signal,
    },
    phase,
  });
  const account = normalizeRecord(payload);
  const accountId = optionalString(account.id);
  const accountNumber = optionalString(account.account_number);

  return {
    profile: {
      accountId: accountId ?? accountNumber ?? fallbackAccountId,
      displayName: accountNumber ?? accountId ?? fallbackDisplayName,
    },
    grantedScopes,
    metadata: compactObject({
      accountNumber,
      apiBaseUrl: tradingBaseUrl(credential.environment),
      dataBaseUrl,
      environment: credential.environment,
      validationEndpoint: "/v2/account",
    }),
  };
}

export function readAlpacaCredential(input: {
  apiKey: unknown;
  apiKeyId: unknown;
  environment: unknown;
}): ApiKeyCredential {
  return {
    authType: "api_key",
    apiSecretKey: requiredInputString(input.apiKey, "apiKey"),
    apiKeyId: requiredInputString(input.apiKeyId, "apiKeyId"),
    environment: readEnvironment(input.environment, "paper"),
  };
}

export function readAlpacaOAuthCredential(
  input: Extract<ResolvedCredential, { authType: "oauth2" }>,
  environment: unknown,
): OAuthCredential {
  return {
    authType: "oauth2",
    accessToken: input.accessToken,
    tokenType: input.tokenType,
    environment: readEnvironment(environment),
  };
}

async function requestAlpacaJson(input: {
  family: ApiFamily;
  path: string;
  query: Record<string, string | undefined>;
  context: ActionContext;
  phase: Phase;
}): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
  const signal = input.context.signal ? AbortSignal.any([input.context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.context.fetcher(
      buildAlpacaUrl(input.family, input.path, input.query, input.context.credential.environment),
      {
        method: "GET",
        headers: alpacaCredentialHeaders(input.context.credential),
        signal,
      },
    );
    const payload = await readAlpacaPayload(response, { strictJson: response.ok });

    if (!response.ok) {
      throw createAlpacaError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutSignal.aborted || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Alpaca request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Alpaca request failed: ${error.message}` : "Alpaca request failed",
    );
  }
}

function buildAlpacaUrl(
  family: ApiFamily,
  path: string,
  query: Record<string, string | undefined>,
  environment: Environment,
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const baseUrl = family === "data" ? dataBaseUrl : tradingBaseUrl(environment);
  const url = new URL(normalizedPath, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

/** Build authentication headers for either an Alpaca OAuth token or API key pair. */
export function alpacaCredentialHeaders(credential: Credential): HeadersInit {
  if (credential.authType === "oauth2") {
    return {
      accept: "application/json",
      authorization: `${credential.tokenType} ${credential.accessToken}`,
      "user-agent": providerUserAgent,
    };
  }

  return {
    accept: "application/json",
    "APCA-API-KEY-ID": credential.apiKeyId,
    "APCA-API-SECRET-KEY": credential.apiSecretKey,
    "user-agent": providerUserAgent,
  };
}

function tradingBaseUrl(environment: Environment): string {
  return environment === "live" ? liveTradingBaseUrl : paperTradingBaseUrl;
}

async function readAlpacaPayload(response: Response, options: { strictJson: boolean }): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!options.strictJson) {
      return text;
    }

    throw new ProviderRequestError(502, "Alpaca returned invalid JSON");
  }
}

function createAlpacaError(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const message = extractAlpacaErrorMessage(payload) ?? `Alpaca request failed with status ${status}`;

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractAlpacaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
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
    optionalString(record.code)
  );
}

function normalizeBarsPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  return {
    bars: optionalRecord(record?.bars) ?? {},
    nextPageToken: optionalString(record?.next_page_token),
  };
}

function normalizeCorporateActionsPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  return {
    corporateActions: optionalRecord(record?.corporate_actions) ?? {},
    nextPageToken: optionalString(record?.next_page_token),
  };
}

function normalizeOptionContractsPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  return {
    optionContracts: arrayPayload(record?.option_contracts, "option_contracts"),
    nextPageToken: optionalString(record?.next_page_token),
  };
}

function normalizeSnapshotsPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  return {
    snapshots: optionalRecord(record?.snapshots) ?? {},
  };
}

function normalizeNewsPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  return {
    news: arrayPayload(record?.news, "news"),
    nextPageToken: optionalString(record?.next_page_token),
  };
}

function arrayPayload(payload: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map(normalizeRecord);
  }

  const record = optionalRecord(payload);
  const value = record?.[fieldName];
  if (Array.isArray(value)) {
    return value.map(normalizeRecord);
  }

  return [];
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return (
    optionalRecord(value) ?? {
      value,
    }
  );
}

function optionalStringList(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.map((item) => optionalString(item)).filter((item) => item !== undefined);
  return values.length > 0 ? values.join(",") : undefined;
}

function stringList(value: unknown, fieldName: string): string {
  const result = optionalStringList(value);
  if (result) {
    return result;
  }

  throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
}

function optionalNumberString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function optionalBooleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readEnvironment(value: unknown, fallback?: Environment): Environment {
  const normalized = optionalString(value) ?? fallback;
  if (normalized === "paper" || normalized === "live") {
    return normalized;
  }

  throw new ProviderRequestError(400, "environment must be paper or live");
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
