import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const metatraderapiApiBaseUrl = "https://metatraderapi.cloud/api/";
const maxResponseBytes = 16 * 1024 * 1024;

type RequestPhase = "validate" | "execute";
interface MetaTraderRequest extends ApiKeyProviderContext {
  path: string;
  phase: RequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}
type MetaTraderHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const metatraderapiActionHandlers: ProviderActionHandlers<"metatraderapi", MetaTraderHandler> = {
  async list_sessions(_input, context) {
    const payload = await requestMetaTrader({ ...context, path: "sessions/", phase: "execute" });
    return { sessions: readArrayPayload(payload, "sessions", "MetaTraderAPI sessions response") };
  },
  async start_session(input, context) {
    const payload = await requestMetaTrader({
      ...context,
      path: "sessions/start/",
      method: "POST",
      phase: "execute",
      body: {
        account_id: requiredInputString(input.accountId, "accountId"),
        password: requirePassword(input.password),
        server: requiredInputString(input.server, "server"),
        platform: requiredInputString(input.platform, "platform"),
      },
    });
    return { session: requireMutationObject(payload, "MetaTraderAPI start session") };
  },
  async stop_session(input, context) {
    return { result: recordOrEmpty(await requestSession(input, context, "stop/", "POST")) };
  },
  async close_all_sessions(_input, context) {
    return {
      result: recordOrEmpty(
        await requestMetaTrader({
          ...context,
          path: "sessions/close-all/",
          method: "POST",
          phase: "execute",
        }),
      ),
    };
  },
  async get_account_info(input, context) {
    return {
      accountInfo: requiredResponseRecord(
        await requestSession(input, context, "account-info/"),
        "MetaTraderAPI account information response",
      ),
    };
  },
  async get_equity(input, context) {
    return {
      equity: requiredResponseRecord(await requestSession(input, context, "equity/"), "MetaTraderAPI equity response"),
    };
  },
  async list_deals(input, context) {
    const payload = await requestHistory(input, context, "history/deals/");
    return { deals: readArrayPayload(payload, "deals", "MetaTraderAPI deals response") };
  },
  async list_history_orders(input, context) {
    const payload = await requestHistory(input, context, "history/orders/");
    return { orders: readArrayPayload(payload, "orders", "MetaTraderAPI order history response") };
  },
  async get_margin(input, context) {
    return {
      margin: requiredResponseRecord(await requestSession(input, context, "margin/"), "MetaTraderAPI margin response"),
    };
  },
  async list_orders(input, context) {
    const payload = await requestSession(input, context, "orders/");
    return { orders: readArrayPayload(payload, "orders", "MetaTraderAPI pending orders response") };
  },
  async ping_session(input, context) {
    return {
      ping: requiredResponseRecord(await requestSession(input, context, "ping/"), "MetaTraderAPI ping response"),
    };
  },
  async list_positions(input, context) {
    const payload = await requestSession(input, context, "positions/");
    return { positions: readArrayPayload(payload, "positions", "MetaTraderAPI positions response") };
  },
  async get_session_status(input, context) {
    return {
      status: requiredResponseRecord(
        await requestSession(input, context, "status/"),
        "MetaTraderAPI session status response",
      ),
    };
  },
  async list_symbols(input, context) {
    const symbols = readArrayPayload(
      await requestSession(input, context, "symbols/"),
      "symbols",
      "MetaTraderAPI symbols response",
    );
    if (!symbols.every((value) => typeof value === "string")) {
      throw providerResponseError("MetaTraderAPI symbols response must contain only strings");
    }
    return { symbols };
  },
  async get_symbol(input, context) {
    const symbol = requiredInputString(input.symbol, "symbol");
    return {
      symbol: requiredResponseRecord(
        await requestSession(input, context, `symbols/${encodeURIComponent(symbol)}/`),
        "MetaTraderAPI symbol response",
      ),
    };
  },
};

export async function validateMetaTraderApiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMetaTrader({ apiKey, fetcher, signal, path: "sessions/", phase: "validate" });
  const sessions = readArrayPayload(payload, "sessions", "MetaTraderAPI sessions response");
  return {
    profile: { displayName: "MetaTraderAPI API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: metatraderapiApiBaseUrl.slice(0, -1),
      validationEndpoint: "/sessions/",
      activeSessionCount: sessions.length,
    },
  };
}

async function requestSession(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  suffix: string,
  method: "GET" | "POST" = "GET",
): Promise<unknown> {
  const sessionId = requiredInputString(input.sessionId, "sessionId");
  return requestMetaTrader({
    ...context,
    path: `sessions/${encodeURIComponent(sessionId)}/${suffix}`,
    method,
    phase: "execute",
  });
}

async function requestHistory(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  suffix: "history/deals/" | "history/orders/",
): Promise<unknown> {
  const sessionId = requiredInputString(input.sessionId, "sessionId");
  return requestMetaTrader({
    ...context,
    path: `sessions/${encodeURIComponent(sessionId)}/${suffix}`,
    query: compactObject({
      date_from: optionalString(input.dateFrom),
      date_to: optionalString(input.dateTo),
      days_back: optionalInteger(input.daysBack),
    }),
    phase: "execute",
  });
}

async function requestMetaTrader(input: MetaTraderRequest): Promise<unknown> {
  try {
    return await runProviderRequest({ label: "MetaTraderAPI", signal: input.signal }, async (signal) => {
      const url = new URL(input.path, metatraderapiApiBaseUrl);
      for (const [key, value] of Object.entries(input.query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
      const headers = new Headers({
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      });
      if (input.body !== undefined) headers.set("content-type", "application/json");
      const response = await input.fetcher(url, {
        method: input.method ?? "GET",
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal,
      });
      const payload = await readPayload(response);
      if (!response.ok) throw createMetaTraderError(response.status, payload, input.phase);
      return payload;
    });
  } catch (error) {
    if (
      input.phase === "execute" &&
      input.method === "POST" &&
      error instanceof ProviderRequestError &&
      error.status >= 500
    ) {
      throw new ProviderRequestError(
        error.status,
        `${error.message}; the operation may have completed upstream. Check the current session or trading state before retrying.`,
        { retryable: false, upstreamCompleted: "unknown" },
      );
    }
    throw error;
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "MetaTraderAPI response", maxResponseBytes);
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (!response.ok) return text.trim();
    throw new ProviderRequestError(502, "MetaTraderAPI returned invalid JSON", error);
  }
}

function createMetaTraderError(status: number, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const message = errorMessage(payload) ?? `MetaTraderAPI request failed with status ${status}`;
  if (phase === "validate" && status >= 400 && status < 500) {
    return providerInputError(message);
  }
  if (status === 400 || status === 404) return providerInputError(message);
  return new ProviderRequestError(status || 502, message);
}

function errorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  for (const key of ["detail", "message", "error"]) {
    const value = optionalString(record?.[key])?.trim();
    if (value) return value;
  }
  return undefined;
}

function readArrayPayload(payload: unknown, field: string, label: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = optionalRecord(payload);
  if (Array.isArray(record?.[field])) return record[field] as unknown[];
  throw providerResponseError(`${label} must contain an array`);
}

function requireMutationObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (record) return record;
  throw new ProviderRequestError(
    502,
    `${label} returned an empty or invalid response; the operation may have completed upstream. Check the current session or trading state before retrying.`,
    { retryable: false, upstreamCompleted: "unknown" },
  );
}

function requirePassword(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw providerInputError("password is required");
  return value;
}
