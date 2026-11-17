import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  optionalInteger,
  optionalRecord,
  optionalScalarString,
  optionalString,
  optionalStringOrNull,
  requiredArray,
} from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import {
  basicAuthorizationHeader,
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderErrorBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { trading212DefaultInstrumentLimit } from "./limits.ts";

type Trading212Environment = "demo" | "live";

/** The key pair of one Trading 212 account and the environment it was generated in. */
export interface Trading212Credential {
  apiKeyId: string;
  apiSecret: string;
  environment: Trading212Environment;
}

/** What every Trading 212 action handler receives. */
export interface Trading212Context {
  credential: Trading212Credential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

/** The stored credential fields: the API Secret is the built-in api key field. */
interface Trading212CredentialInput {
  apiKey: string;
  values: Record<string, string>;
}

interface Trading212HistoryPage {
  items: unknown[];
  nextPagePath: string | null;
}

interface Trading212InstrumentFilter {
  query?: string;
  type?: string;
  currency?: string;
}

/** Path prefix of every Trading 212 Public API endpoint, which the proxy is limited to. */
export const trading212ApiPathPrefix = "/api/v0";

const equityPath = `${trading212ApiPathPrefix}/equity`;

const trading212Origins: Record<Trading212Environment, string> = {
  demo: "https://demo.trading212.com",
  live: "https://live.trading212.com",
};

type Handler = ProviderRuntimeHandler<Trading212Context>;

/**
 * Action handlers for every Trading 212 action. Each one is a single GET, so
 * none of them can place, change or cancel an order.
 */
export const trading212ActionHandlers: ProviderActionHandlers<"trading_212", Handler> = {
  async get_account_summary(_input, context) {
    return { account: await getAccountSummary(context) };
  },
  async list_positions(input, context) {
    const positions = await getTrading212(
      context,
      trading212Url(context, `${equityPath}/positions`, { ticker: optionalString(input.ticker) }),
    );
    return { positions: responseList(positions, "positions") };
  },
  async list_pending_orders(_input, context) {
    const orders = await getTrading212(context, trading212Url(context, `${equityPath}/orders`));
    return { orders: responseList(orders, "pending orders") };
  },
  async get_pending_order(input, context) {
    const orderId = optionalInteger(input.orderId);
    if (orderId === undefined || orderId < 1) {
      throw providerInputError("orderId must be a positive integer.");
    }
    const order = await getTrading212(
      context,
      trading212Url(context, `${equityPath}/orders/${encodePathSegment(orderId)}`),
    );
    return { order: requiredResponseRecord(order, "Trading 212 order") };
  },
  async list_historical_orders(input, context) {
    const page = await getHistoryPage(context, `${equityPath}/history/orders`, input, {
      ticker: optionalString(input.ticker),
    });
    return { orders: page.items, nextPagePath: page.nextPagePath };
  },
  async list_dividends(input, context) {
    const page = await getHistoryPage(context, `${equityPath}/history/dividends`, input, {
      ticker: optionalString(input.ticker),
    });
    return { dividends: page.items, nextPagePath: page.nextPagePath };
  },
  async list_transactions(input, context) {
    const page = await getHistoryPage(context, `${equityPath}/history/transactions`, input, {
      time: optionalString(input.time),
    });
    return { transactions: page.items, nextPagePath: page.nextPagePath };
  },
  async search_instruments(input, context) {
    const instruments = await getTrading212(context, trading212Url(context, `${equityPath}/metadata/instruments`));
    const matches = searchInstruments(responseList(instruments, "instruments"), {
      query: optionalString(input.query),
      type: optionalString(input.type),
      currency: optionalString(input.currency),
    });
    const limit = optionalInteger(input.limit) ?? trading212DefaultInstrumentLimit;
    return { instruments: matches.slice(0, limit), totalMatches: matches.length };
  },
  async list_exchanges(_input, context) {
    const exchanges = await getTrading212(context, trading212Url(context, `${equityPath}/metadata/exchanges`));
    return { exchanges: responseList(exchanges, "exchanges") };
  },
};

/**
 * Read the stored credential: the API Secret is the built-in api key field,
 * and the API Key and the environment are extra fields.
 */
export function readTrading212Credential(input: Trading212CredentialInput): Trading212Credential {
  return {
    apiKeyId: requiredInputString(input.values.apiKeyId, "apiKeyId"),
    apiSecret: requiredInputString(input.apiKey, "apiKey"),
    environment: readTrading212Environment(input.values.environment),
  };
}

/** The origin of the environment a credential belongs to. */
export function trading212Origin(credential: Trading212Credential): string {
  return trading212Origins[credential.environment];
}

/**
 * The Authorization header: HTTP Basic with the API Key as the user name and
 * the API Secret as the password, as Trading 212 documents.
 */
export function trading212Authorization(credential: Trading212Credential): string {
  return basicAuthorizationHeader(`${credential.apiKeyId}:${credential.apiSecret}`);
}

/**
 * Prove a key pair works by reading the account summary, and describe the
 * account it belongs to.
 */
export async function validateTrading212Credential(
  input: Trading212CredentialInput,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = readTrading212Credential(input);
  let account: Record<string, unknown>;
  try {
    account = await getAccountSummary({ credential, fetcher, signal });
  } catch (error) {
    // While connecting, a rejected key is a field error on the form, not a reconnect prompt.
    if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
      throw new ProviderRequestError(
        400,
        error.status === 401
          ? error.message
          : "Trading 212 refused to read the account summary. Give the API key the account permission, and if the key is limited to some IP addresses, allow this server's address.",
        error.details,
      );
    }
    throw error;
  }
  const accountId = optionalScalarString(account.id);
  const environment = credential.environment === "live" ? "Live" : "Demo";
  return {
    profile: {
      accountId: accountId === undefined ? undefined : `${credential.environment}:${accountId}`,
      displayName:
        accountId === undefined ? `Trading 212 ${environment}` : `Trading 212 ${environment} account ${accountId}`,
    },
  };
}

/**
 * Turn a failed Trading 212 response into a provider error. Trading 212
 * documents 401 on every endpoint as a bad API key, so it is the one status
 * reported as a credential failure; 403 means the key lacks the endpoint's
 * permission or is limited to other IP addresses, which reconnecting the same
 * key does not fix. Trading 212's own 408 is its upstream timing out, so it is
 * reported like a local timeout rather than as bad input.
 */
export async function readTrading212Error(response: Response, signal?: AbortSignal): Promise<ProviderRequestError> {
  const body = await readProviderErrorBody(response, "Trading 212", signal);
  switch (response.status) {
    case 401:
      return new ProviderRequestError(
        401,
        "Trading 212 rejected the API key. Check that the API Key and API Secret belong to the same key, that the key was generated in the chosen environment (demo or live) and that it has not been deleted.",
        body,
      );
    case 403:
      return new ProviderRequestError(
        403,
        "Trading 212 refused the request. The API key may lack the permission this endpoint needs, or be limited to other IP addresses.",
        body,
        "provider_error",
      );
    case 404:
      return new ProviderRequestError(404, "Trading 212 found nothing with this identifier.", body);
    case 408:
      return new ProviderRequestError(504, "Trading 212 timed out answering the request.", body);
    case 429:
      return new ProviderRequestError(
        429,
        "Trading 212 rate limit reached for this endpoint. Limits apply per account, so wait before sending more requests.",
        withRetryAfterSeconds(response, body),
      );
    default:
      return new ProviderRequestError(
        response.status,
        `Trading 212 request failed with HTTP ${response.status}.`,
        body,
      );
  }
}

function readTrading212Environment(value: unknown): Trading212Environment {
  const environment = optionalString(value)?.toLowerCase();
  if (environment === "demo" || environment === "live") {
    return environment;
  }
  throw providerInputError("environment must be demo or live.");
}

async function getAccountSummary(context: Trading212Context): Promise<Record<string, unknown>> {
  const summary = await getTrading212(context, trading212Url(context, `${equityPath}/account/summary`));
  return requiredResponseRecord(summary, "Trading 212 account summary");
}

/**
 * Read one page of a history endpoint. The first page is built from the
 * filters; a later page follows the nextPagePath Trading 212 returned, which
 * already carries the cursor, filters and limit, as long as it stays on the
 * same endpoint of the same environment.
 */
async function getHistoryPage(
  context: Trading212Context,
  path: string,
  input: Record<string, unknown>,
  filters: Record<string, QueryValue>,
): Promise<Trading212HistoryPage> {
  const query = { ...filters, limit: optionalInteger(input.limit) };
  const nextPagePath = optionalString(input.nextPagePath);
  let url: URL;
  if (nextPagePath === undefined) {
    url = trading212Url(context, path, query);
  } else {
    if (Object.values(query).some((value) => value !== undefined)) {
      throw providerInputError(
        "nextPagePath already carries the filters and the limit of its page; send it on its own.",
      );
    }
    const origin = trading212Origin(context.credential);
    const pageUrl = URL.canParse(nextPagePath, origin) ? new URL(nextPagePath, origin) : undefined;
    if (pageUrl?.origin !== origin || pageUrl.pathname !== path) {
      throw providerInputError("nextPagePath must be the nextPagePath this action returned.");
    }
    url = pageUrl;
  }
  const page = requiredResponseRecord(await getTrading212(context, url), "Trading 212 history page");
  return {
    items: requiredArray(page.items, "Trading 212 history page items", providerResponseError),
    nextPagePath: optionalStringOrNull(page.nextPagePath),
  };
}

/**
 * Filter the instrument list. Exact matches of the ticker, symbol or ISIN come
 * first, then instruments whose ticker, symbol, ISIN or name contains the text;
 * both keep Trading 212's order.
 */
function searchInstruments(instruments: unknown[], filter: Trading212InstrumentFilter): Record<string, unknown>[] {
  const query = filter.query?.toLowerCase();
  const currency = filter.currency?.toUpperCase();
  const exact: Record<string, unknown>[] = [];
  const partial: Record<string, unknown>[] = [];
  for (const value of instruments) {
    const instrument = optionalRecord(value);
    if (!instrument) continue;
    if (filter.type !== undefined && instrument.type !== filter.type) continue;
    if (currency !== undefined && instrument.currencyCode !== currency) continue;
    if (query === undefined) {
      partial.push(instrument);
      continue;
    }
    const codes = [instrument.ticker, instrument.shortName, instrument.isin].map((code) =>
      optionalString(code)?.toLowerCase(),
    );
    if (codes.includes(query)) {
      exact.push(instrument);
    } else if ([...codes, optionalString(instrument.name)?.toLowerCase()].some((text) => text?.includes(query))) {
      partial.push(instrument);
    }
  }
  return [...exact, ...partial];
}

function trading212Url(context: Trading212Context, path: string, query: Record<string, QueryValue> = {}): URL {
  const url = new URL(path, trading212Origin(context.credential));
  setSearchParams(url, queryParams(query));
  return url;
}

async function getTrading212(context: Trading212Context, url: URL): Promise<unknown> {
  return runProviderRequest({ label: "Trading 212", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: trading212Authorization(context.credential),
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      throw await readTrading212Error(response, signal);
    }
    const body = await readProviderTextBody(response, "Trading 212 response", undefined, signal);
    return parseProviderJsonBodyText(body, {
      emptyBody: null,
      invalidJsonMessage: "Trading 212 returned invalid JSON",
    });
  });
}

/** A list response, where an empty body means an empty list; any other shape is a provider error. */
function responseList(response: unknown, label: string): unknown[] {
  return response === null ? [] : requiredArray(response, `Trading 212 ${label} response`, providerResponseError);
}
