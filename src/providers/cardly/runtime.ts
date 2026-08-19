import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  nullableInteger,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, setSearchParams } from "../provider-runtime.ts";

const cardlyApiBaseUrl = "https://api.card.ly/v2";
const cardlyBalancePath = "/account/balance";

type CardlyRequestPhase = "validate" | "execute";
type CardlyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const cardlyActionHandlers: ProviderActionHandlers<"cardly", CardlyActionHandler> = {
  echo(input, context) {
    return executeEcho(input, context);
  },
  get_balance(_input, context) {
    return executeGetBalance(context);
  },
  list_credit_history(input, context) {
    return executePaginatedList("/account/credit-history", input, context);
  },
  list_gift_credit_history(input, context) {
    return executePaginatedList("/account/gift-credit-history", input, context);
  },
  list_media(input, context) {
    return executePaginatedList("/media", input, context);
  },
  list_fonts(input, context) {
    return executePaginatedList("/fonts", input, context);
  },
  list_writing_styles(input, context) {
    return executePaginatedList("/writing-styles", input, context);
  },
};

export async function validateCardlyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await cardlyGetJson(cardlyBalancePath, {}, apiKey, fetcher, signal, "validate");
  const data = optionalRecord(optionalRecord(payload)?.data);

  return {
    profile: {
      accountId: "cardly",
      displayName: "Cardly API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: cardlyApiBaseUrl,
      validationEndpoint: cardlyBalancePath,
      balance: optionalNumber(data?.balance),
      giftCreditCurrency: optionalString(optionalRecord(data?.giftCredit)?.currency),
    }),
  };
}

async function executeEcho(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await cardlyPostJson(
    "/echo",
    { test: optionalString(input.test) },
    optionalRecord(input.body) ?? {},
    context,
  );
  const root = requireObjectPayload(payload);
  const data = optionalRecord(root.data) ?? {};

  return {
    state: optionalRecord(root.state) ?? {},
    method: nullableString(data.method),
    url: nullableString(data.url),
    headers: redactSensitiveFields(optionalRecord(data.headers) ?? {}),
    params: optionalRecord(data.params) ?? {},
    body: optionalRecord(data.body) ?? {},
    raw: redactSensitiveFields(root),
  };
}

async function executeGetBalance(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await cardlyGetJson(cardlyBalancePath, {}, context.apiKey, context.fetcher, context.signal);
  const root = requireObjectPayload(payload);
  const data = optionalRecord(root.data) ?? {};
  const giftCredit = optionalRecord(data.giftCredit);

  return {
    state: optionalRecord(root.state) ?? {},
    balance: nullableNumber(data.balance),
    giftCredit: giftCredit
      ? {
          balance: nullableNumber(giftCredit.balance),
          currency: nullableString(giftCredit.currency),
          raw: giftCredit,
        }
      : null,
    raw: root,
  };
}

async function executePaginatedList(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await cardlyGetJson(path, buildListQuery(input), context.apiKey, context.fetcher, context.signal);
  return normalizePaginatedPayload(payload);
}

async function cardlyGetJson(
  path: string,
  query: Record<string, string | number | undefined>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  phase: CardlyRequestPhase = "execute",
): Promise<Record<string, unknown>> {
  const url = new URL(`${cardlyApiBaseUrl}${path}`);
  setSearchParams(url, stringifyQuery(query));

  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: cardlyHeaders(apiKey, { accept: "application/json" }),
      signal,
    });
    payload = await readCardlyPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `cardly request failed: ${error.message}` : "cardly request failed",
    );
  }

  if (!response.ok) {
    throw createCardlyError(response, payload, phase);
  }
  return requireObjectPayload(payload);
}

async function cardlyPostJson(
  path: string,
  query: Record<string, string | number | undefined>,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const url = new URL(`${cardlyApiBaseUrl}${path}`);
  setSearchParams(url, stringifyQuery(query));

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "POST",
      headers: cardlyHeaders(context.apiKey, {
        accept: "application/json",
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readCardlyPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `cardly request failed: ${error.message}` : "cardly request failed",
    );
  }

  if (!response.ok) {
    throw createCardlyError(response, payload, "execute");
  }
  return requireObjectPayload(payload);
}

function cardlyHeaders(apiKey: string, extraHeaders: Record<string, string>): HeadersInit {
  return {
    "API-Key": apiKey,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

function stringifyQuery(query: Record<string, string | number | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, value === undefined ? undefined : String(value)]),
  );
}

function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isSensitiveHeaderName(key) ? "[redacted]" : redactSensitiveFields(child),
    ]),
  );
}

function isSensitiveHeaderName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized === "api-key" ||
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "set-cookie" ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password")
  );
}

function buildListQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
    "effectiveTime.lt": optionalString(input.effectiveTimeLt),
    "effectiveTime.lte": optionalString(input.effectiveTimeLte),
    "effectiveTime.gt": optionalString(input.effectiveTimeGt),
    "effectiveTime.gte": optionalString(input.effectiveTimeGte),
  };
}

async function readCardlyPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function requireObjectPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "cardly returned invalid JSON payload", payload);
  }
  return record;
}

function normalizePaginatedPayload(payload: unknown): unknown {
  const root = requireObjectPayload(payload);
  const data = optionalRecord(root.data) ?? {};
  const results = Array.isArray(data.results)
    ? data.results.map((item) => optionalRecord(item) ?? { value: item })
    : [];

  return {
    state: optionalRecord(root.state) ?? {},
    meta: normalizePaginationMeta(data.meta),
    results,
    raw: root,
  };
}

function normalizePaginationMeta(value: unknown): Record<string, unknown> {
  const meta = optionalRecord(value) ?? {};
  return {
    ...meta,
    limit: nullableInteger(meta.limit) ?? null,
    offset: nullableInteger(meta.offset) ?? null,
    total: nullableInteger(meta.total) ?? null,
  };
}

function nullableString(value: unknown): string | null {
  return value === null ? null : (optionalString(value) ?? null);
}

function nullableNumber(value: unknown): number | null {
  return value === null ? null : (optionalNumber(value) ?? null);
}

function createCardlyError(response: Response, payload: unknown, phase: CardlyRequestPhase): ProviderRequestError {
  const message = (extractCardlyErrorMessage(payload) ?? response.statusText) || "cardly request failed";
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if ([400, 404, 422].includes(response.status)) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function extractCardlyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const root = optionalRecord(payload);
  const state = optionalRecord(root?.state);
  return optionalString(state?.message) ?? optionalString(root?.message) ?? optionalString(root?.error);
}
