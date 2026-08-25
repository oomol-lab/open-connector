import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { DumplingaiActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const dumplingaiApiBaseUrl = "https://app.dumplingai.com";
const balancePath = "/api/v2/balance";
type Phase = "validate" | "execute";

const requests: Record<DumplingaiActionName, { method: "GET" | "POST"; path: string }> = {
  search_catalog: { method: "POST", path: "/api/v2/search" },
  get_catalog_details: { method: "POST", path: "/api/v2/details" },
  run: { method: "POST", path: "/api/v2/run" },
  get_balance: { method: "GET", path: balancePath },
  list_usage: { method: "GET", path: "/api/v2/usage" },
  list_transactions: { method: "GET", path: "/api/v2/transactions" },
};

async function execute(
  name: DumplingaiActionName,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const request = requests[name];
  return requestJson(request.method, request.path, input, context.apiKey, context.fetcher, "execute");
}

const handler =
  (name: DumplingaiActionName): ProviderRuntimeHandler<ApiKeyProviderContext> =>
  (input, context) =>
    execute(name, input, context);
export const dumplingaiActionHandlers: ProviderActionHandlers<
  "dumplingai",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  search_catalog: handler("search_catalog"),
  get_catalog_details: handler("get_catalog_details"),
  run: handler("run"),
  get_balance: handler("get_balance"),
  list_usage: handler("list_usage"),
  list_transactions: handler("list_transactions"),
};

export async function validateDumplingaiCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[] }> {
  await requestJson("GET", balancePath, {}, apiKey, fetcher, "validate");
  return { profile: { displayName: "DumplingAI API Key" }, grantedScopes: [] };
}

async function requestJson(
  method: "GET" | "POST",
  path: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: Phase,
): Promise<unknown> {
  const url = new URL(path, dumplingaiApiBaseUrl);
  if (method === "GET")
    for (const [key, value] of Object.entries(input)) if (value !== undefined) url.searchParams.set(key, String(value));
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (method === "POST") headers.set("content-type", "application/json");
  const response = await fetcher(url, {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify(input) } : {}),
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim())
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(502, "DumplingAI returned invalid JSON");
    }
  if (!response.ok) throw mapError(response.status, payload, phase);
  if (!optionalRecord(payload)) throw new ProviderRequestError(502, "DumplingAI returned invalid JSON");
  return payload;
}

function mapError(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.error) ??
    optionalString(record?.message) ??
    `DumplingAI request failed with status ${status}`;
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 400 || status === 404 || status === 422) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status || 502, message);
}
