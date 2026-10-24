import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { kickofflabsActions } from "./actions.ts";
const baseUrl = "https://api.kickofflabs.com/v2";

async function request(route: string, apiKey: string, fetcher: typeof fetch, parentSignal?: AbortSignal) {
  return runProviderRequest({ signal: parentSignal, label: "kickofflabs" }, async (signal) => {
    const url = new URL(`${baseUrl}${route}`);
    url.searchParams.set("api_key", apiKey);
    const response = await fetcher(url, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal,
    });
    const text = await readProviderTextBody(response, "kickofflabs response", undefined, signal);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok)
        throw new ProviderRequestError(502, "kickofflabs returned invalid JSON", undefined, "provider_error");
    }
    if (!response.ok) {
      const object = optionalRecord(payload);
      const message =
        optionalRawString(object?.message) ??
        optionalRawString(object?.error) ??
        `kickofflabs request failed (HTTP ${response.status})`;
      throw new ProviderRequestError(
        response.status,
        message.replaceAll(apiKey, "[REDACTED]"),
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return payload;
  });
}

const handlers = mapProviderActionHandlers(
  "kickofflabs",
  kickofflabsActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const route =
      action.name === "list_campaigns"
        ? "/campaigns"
        : `/${values.campaignId}/${action.name === "get_campaign_stats" ? "stats" : "actions"}`;
    const payload = await request(route, context.apiKey, context.fetcher, context.signal);
    if (action.name !== "get_campaign_stats") {
      if (!Array.isArray(payload)) throw providerResponseError("KickoffLabs list must be an array");
      return action.name === "list_campaigns" ? { campaigns: payload } : { actions: payload };
    }
    return requiredResponseRecord(payload, "kickofflabs campaign stats");
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("kickofflabs", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const campaigns = await request("/campaigns", requiredInputString(input.apiKey, "API Key"), fetcher);
    if (!Array.isArray(campaigns)) throw providerResponseError("KickoffLabs campaigns must be an array");
    return {
      profile: { displayName: "KickoffLabs API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/campaigns" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "kickofflabs",
  baseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});
