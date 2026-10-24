import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "phonely";
const baseUrl = "https://app.phonely.ai/api";
interface Context {
  apiKey: string;
  userId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
function userId(values: Record<string, unknown>): string {
  const value = optionalString(values.userId)?.trim();
  if (!value) throw new ProviderRequestError(400, "Phonely userId is required");
  return value;
}
async function request(
  path: string | URL,
  method: "GET" | "POST",
  body: Record<string, unknown> | undefined,
  context: Context,
): Promise<unknown> {
  const url = path instanceof URL ? path : new URL(path.replace(/^\//u, ""), `${baseUrl}/`);
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      "user-agent": providerUserAgent,
      "X-Authorization": context.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "Phonely returned invalid JSON");
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      optionalString(optionalRecord(payload)?.message) ??
        optionalString(optionalRecord(payload)?.error) ??
        `Phonely request failed with HTTP ${response.status}`,
      payload,
    );
  return payload;
}
const handlers = {
  async list_agents(_input: Record<string, unknown>, context: Context) {
    const value = await request("/get-agents", "POST", { uid: context.userId }, context);
    return { agents: Array.isArray(value) ? value : [] };
  },
  async get_agent(input: Record<string, unknown>, context: Context) {
    return {
      agent: await request(
        "/get-agent",
        "POST",
        { uid: context.userId, agentId: requiredString(input.agentId, "agentId") },
        context,
      ),
    };
  },
  async get_call(input: Record<string, unknown>, context: Context) {
    const value = await request(
      "/get-call",
      "POST",
      {
        uid: context.userId,
        agentId: requiredString(input.agentId, "agentId"),
        callId: requiredString(input.callId, "callId"),
      },
      context,
    );
    return { calls: Array.isArray(value) ? value : [] };
  },
  async list_calls(input: Record<string, unknown>, context: Context) {
    const url = new URL(`${baseUrl}/calls/${encodeURIComponent(requiredString(input.agentId, "agentId"))}`);
    const names: Array<[string, string]> = [
      ["limit", "limit"],
      ["offset", "offset"],
      ["customerPhoneNumber", "customer_phone_number"],
      ["campaignId", "campaign_id"],
      ["status", "status"],
      ["sentiment", "sentiment"],
      ["callType", "call_type"],
      ["outcome", "outcome"],
      ["endedReason", "ended_reason"],
      ["mode", "mode"],
      ["startDate", "start_date"],
      ["endDate", "end_date"],
      ["minDuration", "min_duration"],
      ["maxDuration", "max_duration"],
    ];
    for (const [field, name] of names) {
      const value = input[field];
      if (Array.isArray(value)) for (const item of value) url.searchParams.append(name, String(item));
      else if (typeof value === "string" || typeof value === "number") url.searchParams.set(name, String(value));
    }
    return request(url, "GET", undefined, context);
  },
};
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, userId: userId(credential.values), fetcher, signal: context.signal };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "X-Authorization" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, userId: userId(input.values), fetcher, signal };
    const value = await request("/get-agents", "POST", { uid: context.userId }, context);
    const first = optionalRecord(Array.isArray(value) ? value[0] : undefined);
    return {
      profile: { displayName: optionalString(first?.name)?.trim() || `Phonely ${context.userId}` },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, userId: context.userId, validationEndpoint: "/get-agents" },
    };
  },
};
