import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
export const rewiserApiBaseUrl = "https://api.rewiser.io/functions/v1";

export const rewiserActionHandlers: ProviderActionHandlers<
  "rewiser",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  async get_folders(_input, context) {
    const payload = await request("/get-folders", { method: "GET" }, context, "execute");
    if (!Array.isArray(payload)) throw new ProviderRequestError(502, "Rewiser folders response was not an array");
    return { folders: payload };
  },
  async get_recent_transactions(input, context) {
    if (input.folder_mode === "single" && !optionalString(input.folder_id))
      throw new ProviderRequestError(400, "folder_id is required when folder_mode is single");
    const record = requiredObject(
      await request(
        "/get-recent-transactions",
        {
          method: "GET",
          query: compactObject({
            folder_mode: input.folder_mode,
            folder_id: input.folder_id,
            type: input.type,
            format: "standard",
          }),
        },
        context,
        "execute",
      ),
      "Rewiser returned an invalid recent transactions response",
    );
    if (!Array.isArray(record.data))
      throw new ProviderRequestError(502, "Rewiser recent transactions response did not include data");
    return {
      success: record.success,
      count: optionalInteger(record.count) ?? record.data.length,
      timestamp: record.timestamp,
      transactions: record.data,
    };
  },
  async create_multiple_transactions(input, context) {
    const record = requiredObject(
      await request(
        "/create_multiple_transactions",
        { method: "POST", body: { transactions: input.transactions } },
        context,
        "execute",
      ),
      "Rewiser returned an invalid transaction creation response",
    );
    return {
      success: record.success,
      request_id: record.request_id,
      inserted_count: optionalInteger(record.inserted_count) ?? 0,
      failed_count: optionalInteger(record.failed_count) ?? 0,
      duplicate_count: optionalInteger(record.duplicate_count) ?? 0,
      skipped_count: optionalInteger(record.skipped_count) ?? 0,
      total_processed: optionalInteger(record.total_processed) ?? 0,
      timestamp: record.timestamp,
      inserted: Array.isArray(record.inserted) ? record.inserted : [],
      duplicates: Array.isArray(record.duplicates) ? record.duplicates : [],
      skipped: Array.isArray(record.skipped) ? record.skipped : [],
      rate_limit_info: optionalRecord(record.rate_limit_info) ?? {},
      raw: record,
    };
  },
};
export async function validateRewiser(context: ApiKeyProviderContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const record = requiredObject(
    await request("/verify-auth", { method: "POST" }, context, "validate"),
    "Rewiser returned an invalid auth response",
  );
  const user = optionalRecord(record.user);
  const label = optionalString(user?.full_name) ?? optionalString(user?.email) ?? "Rewiser API Key";
  return {
    profile: { accountId: "api_key", displayName: label },
    grantedScopes: [],
    metadata: { apiBaseUrl: rewiserApiBaseUrl, validationEndpoint: "/verify-auth" },
  };
}
interface RequestOptions {
  method: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}
async function request(
  path: string,
  options: RequestOptions,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(`${rewiserApiBaseUrl}${path}`);
  for (const [name, value] of Object.entries(options.query ?? {}))
    if (value !== undefined) url.searchParams.set(name, String(value));
  const response = await context.fetcher(url, {
    method: options.method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      "user-agent": providerUserAgent,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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
      optionalString(record?.error) ??
      optionalString(record?.message) ??
      (typeof payload === "string" ? payload : `Rewiser request failed with status ${response.status}`);
    if (response.status === 429) throw new ProviderRequestError(429, message);
    if (phase === "validate" && (response.status === 401 || response.status === 403))
      throw new ProviderRequestError(400, message);
    if (response.status === 401) throw new ProviderRequestError(401, message);
    throw new ProviderRequestError(response.status, message);
  }
  return payload;
}
function requiredObject(payload: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, message);
  return record;
}
