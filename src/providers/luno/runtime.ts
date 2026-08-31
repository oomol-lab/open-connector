import type { ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
export const lunoApiBaseUrl = "https://api.luno.com";
interface LunoContext {
  keyId: string;
  keySecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
export async function createLunoContext(context: ExecutionContext, fetcher: typeof fetch): Promise<LunoContext> {
  const credential = await requireApiKeyCredential(context, "luno");
  return {
    keyId: requiredString(credential.values.keyId, "keyId", providerInputError),
    keySecret: credential.apiKey,
    fetcher,
    signal: context.signal,
  };
}
export const lunoActionHandlers: ProviderActionHandlers<
  "luno",
  (input: Record<string, unknown>, context: LunoContext) => Promise<unknown>
> = {
  get_ticker: (input, context) =>
    request("/api/1/ticker", { pair: required(input.pair, "pair") }, undefined, context, "execute"),
  list_tickers: (input, context) =>
    request("/api/1/tickers", undefined, [["pair", strings(input.pairs)]], context, "execute"),
  list_recent_trades: (input, context) =>
    request(
      "/api/1/trades",
      compactObject({ pair: required(input.pair, "pair"), since: integerString(input.since) }),
      undefined,
      context,
      "execute",
    ),
  get_top_order_book: (input, context) =>
    request("/api/1/orderbook_top", { pair: required(input.pair, "pair") }, undefined, context, "execute"),
  get_balances: (input, context) =>
    request("/api/1/balance", undefined, [["assets", strings(input.assets)]], context, "execute"),
  list_orders: (input, context) =>
    request(
      "/api/1/listorders",
      compactObject({
        state: optionalString(input.state),
        pair: optionalString(input.pair),
        created_before: integerString(input.created_before),
        limit: integerString(input.limit),
      }),
      undefined,
      context,
      "execute",
    ),
  get_order: (input, context) =>
    request(`/api/1/orders/${encodeURIComponent(required(input.id, "id"))}`, undefined, undefined, context, "execute"),
};
export async function validateLuno(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const keyId = requiredString(input.values.keyId, "keyId", providerInputError);
  const payload = object(
    await request(
      "/api/1/balance",
      undefined,
      undefined,
      { keyId, keySecret: input.apiKey, fetcher, signal },
      "validate",
    ),
    "Luno balance response",
  );
  if (!Array.isArray(payload.balance))
    throw new ProviderRequestError(502, "Luno balance response balance must be an array");
  const first = optionalRecord(payload.balance[0]);
  const accountId = optionalString(first?.account_id) ?? `luno:${keyId}`;
  const name = optionalString(first?.name);
  return {
    profile: { accountId, displayName: name ? `Luno ${name}` : `Luno ${keyId}` },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: lunoApiBaseUrl,
      validationEndpoint: "/api/1/balance",
      keyId,
      firstAccountId: optionalString(first?.account_id),
    }),
  };
}
async function request(
  path: string,
  query: Record<string, string | undefined> | undefined,
  arrays: Array<[string, string[] | undefined]> | undefined,
  context: LunoContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(path, lunoApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, value);
  for (const [key, values] of arrays ?? []) for (const value of values ?? []) url.searchParams.append(key, value);
  const response = await context.fetcher(url, {
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${context.keyId}:${context.keySecret}`).toString("base64")}`,
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const message =
      (typeof payload === "string" ? payload : undefined) ??
      optionalString(record?.error) ??
      optionalString(record?.error_code) ??
      optionalString(record?.message) ??
      `Luno request failed with status ${response.status}`;
    if (response.status === 429) throw new ProviderRequestError(429, message);
    if (phase === "validate" && [400, 401, 403].includes(response.status)) throw new ProviderRequestError(400, message);
    if (response.status === 401 || response.status === 403) throw new ProviderRequestError(401, message);
    throw new ProviderRequestError(response.status === 400 || response.status === 404 ? 400 : response.status, message);
  }
  return payload;
}
function required(value: unknown, field: string): string {
  return requiredString(value, field, providerInputError);
}
function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => required(item, "array item"));
}
function integerString(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}
function object(value: unknown, label: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `${label} must be an object`);
  return result;
}
