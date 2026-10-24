import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  isAbortLikeError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { viralLoopsActions } from "./actions.ts";
const baseUrl = "https://app.viral-loops.com/api/v3";
const endpoints: Record<string, string> = {
  get_campaign: "/campaign/data",
  get_campaign_stats: "/campaign/stats",
  get_participant: "/campaign/participant/data",
  list_referrals: "/campaign/participant/referrals",
  query_participants: "/campaign/participant/query",
  get_referrer: "/campaign/participant/referrer",
  get_participant_rank: "/campaign/participant/rank",
  get_participant_order: "/campaign/participant/order",
};
async function request(
  endpoint: string,
  method: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  const url = new URL(`${baseUrl}${endpoint}`);
  if (method === "GET")
    for (const [key, value] of Object.entries(input)) if (value != null) url.searchParams.set(key, String(value));
  return runProviderRequest({ signal: parentSignal, label: "Viral Loops" }, async (signal) => {
    const headers = new Headers({ apiToken: apiKey, accept: "application/json" });
    if (method === "POST") headers.set("content-type", "application/json");
    const response = await fetcher(url, {
      method,
      headers,
      signal,
      body: method === "POST" ? JSON.stringify(input) : undefined,
    });
    let payload: unknown;
    try {
      payload = await JSON.parse(await readProviderTextBody(response, "viral_loops response", undefined, signal));
    } catch (error) {
      if (error instanceof ProviderRequestError || isAbortLikeError(error)) throw error;
      if (response.ok)
        throw new ProviderRequestError(502, "Viral Loops returned invalid JSON", undefined, "provider_error");
    }
    if (!response.ok) {
      const body = optionalRecord(payload);
      const details = [
        optionalRawString(body?.error),
        optionalRawString(body?.message),
        optionalRawString(body?.description),
      ]
        .filter(Boolean)
        .join(": ");
      throw new ProviderRequestError(
        response.status,
        (details || `Viral Loops HTTP ${response.status}`).replaceAll(apiKey, "[REDACTED]"),
        withRetryAfterSeconds(response),
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return payload;
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "viral_loops",
  mapProviderActionHandlers(
    "viral_loops",
    viralLoopsActions,
    (_action, actionName) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const result = await request(
        endpoints[actionName]!,
        actionName === "query_participants" ? "POST" : "GET",
        input,
        context.apiKey,
        context.fetcher,
        context.signal,
      );
      return actionName === "get_referrer" ? { result } : requiredResponseRecord(result, "Viral Loops response");
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const apiKey = requiredInputString(input.apiKey, "API Key");
    await request("/campaign/stats", "GET", {}, apiKey, fetcher);
    const campaign = requiredResponseRecord(
      await request("/campaign/data", "GET", {}, apiKey, fetcher),
      "Viral Loops campaign",
    );
    return {
      profile: { displayName: optionalRawString(campaign.campaignName) ?? "Viral Loops Campaign" },
      grantedScopes: [],
      metadata: { validationEndpoint: "/campaign/stats" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "viral_loops",
  baseUrl,
  auth: { type: "api_key_header", name: "apiToken" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({ accept: "application/json" }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
