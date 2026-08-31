import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
export const handelsregisterAiApiBaseUrl = "https://handelsregister.ai/api";

export const handelsregisterAiActionHandlers: ProviderActionHandlers<
  "handelsregister_ai",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  search_organizations(input, context) {
    const query = new URLSearchParams();
    appendString(query, "q", input.q);
    appendNumber(query, "skip", input.skip);
    appendNumber(query, "limit", input.limit);
    appendString(query, "ai_mode", input.ai_mode);
    if (input.filters !== undefined) query.set("filters", JSON.stringify(input.filters));
    return request("/v1/search-organizations", query, context, "execute");
  },
  fetch_organization(input, context) {
    const query = new URLSearchParams();
    appendString(query, "q", requiredString(input.q, "q", providerInputError));
    if (Array.isArray(input.features)) for (const feature of input.features) appendString(query, "feature", feature);
    appendString(query, "ai_search", input.ai_search);
    appendString(query, "realtime_mode", input.realtime_mode);
    if (
      input.realtime_mode === "handelsregister-default" &&
      Array.isArray(input.features) &&
      (input.features.includes("related_persons") || input.features.includes("publications"))
    )
      throw new ProviderRequestError(400, "realtime_mode cannot be combined with related_persons or publications");
    return request("/v1/fetch-organization", query, context, "execute");
  },
};
export async function validateHandelsregisterAi(context: ApiKeyProviderContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await request("/v1/account", undefined, context, "validate");
  const account = optionalRecord(optionalRecord(payload)?.account);
  const label = optionalString(account?.name) ?? "Handelsregister AI API Key";
  return {
    profile: { accountId: "api_key", displayName: label },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: handelsregisterAiApiBaseUrl,
      validationEndpoint: "/v1/account",
      ...(typeof account?.plan === "string" ? { plan: account.plan } : {}),
    },
  };
}
async function request(
  path: string,
  query: URLSearchParams | undefined,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(`${handelsregisterAiApiBaseUrl}${path}`);
  if (query) url.search = query.toString();
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "user-agent": providerUserAgent, "x-api-key": context.apiKey },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(502, "Handelsregister AI returned invalid JSON");
    }
  }
  if (!response.ok) throw mapError(response.status, errorMessage(payload), phase);
  return payload;
}
function errorMessage(payload: unknown): string {
  const record = optionalRecord(payload);
  if (typeof record?.error === "string") return record.error;
  if (typeof record?.message === "string") return record.message;
  if (Array.isArray(record?.detail)) {
    const detail = optionalRecord(record.detail[0]);
    if (typeof detail?.msg === "string") return detail.msg;
  }
  return "Handelsregister AI request failed";
}
function mapError(status: number, message: string, phase: "validate" | "execute"): ProviderRequestError {
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  return new ProviderRequestError(status < 500 ? 400 : 502, message);
}
function appendString(query: URLSearchParams, name: string, value: unknown): void {
  if (typeof value === "string") query.append(name, value);
}
function appendNumber(query: URLSearchParams, name: string, value: unknown): void {
  if (typeof value === "number") query.append(name, String(value));
}
