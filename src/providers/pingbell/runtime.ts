import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalNumber, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const pingbellApiBaseUrl = "https://api.pingbell.io";
const pingbellWebhookBaseUrl = "https://hooks.pingbell.io";

export const pingbellActionHandlers: ProviderActionHandlers<
  "pingbell",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async list_sources(_input, context) {
    return { sources: await listSources(context.apiKey, context.fetcher, context.signal) };
  },
  async ring_source(input, context) {
    const url = new URL("/log", pingbellWebhookBaseUrl);
    url.searchParams.set("id", String(input.sourceId));
    const amount = optionalNumber(input.amount);
    const currency = optionalString(input.currency);
    const transactionId = optionalString(input.transactionId);
    if (amount != null) url.searchParams.set("amount", String(amount));
    if (currency) url.searchParams.set("currency", currency);
    if (transactionId) url.searchParams.set("transaction_id", transactionId);
    const response = await context.fetcher(url, { method: "POST", signal: context.signal });
    const text = await response.text();
    if (!response.ok) throw pingbellError(response.status, text, false);
    if (!text.trim()) throw new ProviderRequestError(502, "PingBell notification response was empty");
    return { status: text.trim() };
  },
};

export async function validatePingbellCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const sources = await listSources(apiKey, fetcher, signal, true);
  return {
    profile: { accountId: `pingbell:${apiKey.slice(-8)}`, displayName: "PingBell API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: pingbellApiBaseUrl, sourceCount: sources.length },
  };
}

async function listSources(apiKey: string, fetcher: typeof fetch, signal?: AbortSignal, validating = false) {
  const response = await fetcher(new URL("/userPingbells", pingbellApiBaseUrl), {
    headers: { accept: "application/json", "x-api-key": apiKey },
    signal,
  });
  const text = await response.text();
  if (!response.ok) throw pingbellError(response.status, text, validating);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "PingBell returned invalid JSON");
  }
  if (!Array.isArray(payload)) throw new ProviderRequestError(502, "PingBell list response was not an array");
  return payload.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ProviderRequestError(502, "PingBell list response included an invalid item");
    }
    const record = value as Record<string, unknown>;
    const name = requiredString(record.name, "source.name", (message) => new ProviderRequestError(502, message));
    if (typeof record.id !== "string" && typeof record.id !== "number") {
      throw new ProviderRequestError(502, "PingBell source ID is invalid");
    }
    return { id: String(record.id), name };
  });
}

function pingbellError(status: number, body: string, validating: boolean): ProviderRequestError {
  const message = body.trim() || `PingBell request failed with HTTP ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) return new ProviderRequestError(validating ? 400 : 401, message);
  return new ProviderRequestError(status, message);
}
