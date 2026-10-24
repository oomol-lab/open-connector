import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
  runProviderRequest,
  ProviderRequestError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { growsurfActions } from "./actions.ts";
const baseUrl = "https://api.growsurf.com/v2";
function encodePathSegment(value: string) {
  if (value === "." || value === "..") {
    throw providerInputError("GrowSurf path identifiers cannot be dot segments");
  }
  return encodeURIComponent(value);
}
interface GrowSurfRequest extends ApiKeyProviderContext {
  endpoint: string;
  method: string;
  body?: unknown;
  query?: URLSearchParams;
}
async function request({ endpoint, method, apiKey, body, query, fetcher, signal: parentSignal }: GrowSurfRequest) {
  return runProviderRequest({ label: "GrowSurf", signal: parentSignal }, async (signal) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    if (query) url.search = query.toString();
    const headers = new Headers({
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      "user-agent": providerUserAgent,
    });
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const text = await response.text();
    let payload: unknown = undefined;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    if (!response.ok) {
      const error = optionalRecord(payload);
      const code = optionalRawString(error?.code);
      const detail = optionalRawString(error?.message) ?? optionalRawString(error?.name) ?? text;
      const message = [code, detail.trim() || `GrowSurf request failed with status ${response.status}`]
        .filter(Boolean)
        .join(": ");
      throw new ProviderRequestError(
        response.status,
        message.replaceAll(apiKey, "[REDACTED]"),
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "GrowSurf response");
  });
}
const handlers = mapProviderActionHandlers(
  "growsurf",
  growsurfActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    let endpoint: string;
    let method = "GET";
    let body: unknown = undefined;
    let query: URLSearchParams | undefined = undefined;
    if (action.name === "get_team") {
      endpoint = "/team";
    } else if (action.name === "list_campaigns") {
      endpoint = "/campaigns";
    } else {
      endpoint = `/campaign/${encodePathSegment(requiredInputString(values.campaignId, "campaignId"))}`;
      switch (action.name) {
        case "get_campaign":
          break;
        case "list_participants": {
          endpoint += "/participants";
          query = new URLSearchParams();
          if (values.nextId !== undefined) query.set("nextId", String(values.nextId));
          if (values.limit !== undefined) query.set("limit", String(values.limit));
          for (const [key, value] of Object.entries(optionalRecord(values.metadata) ?? {})) {
            query.set(`metadata[${key}]`, String(value));
          }
          break;
        }
        case "create_participant":
          endpoint += "/participant";
          method = "POST";
          body = values.participant;
          break;
        default:
          endpoint += `/participant/${encodePathSegment(requiredInputString(values.participantIdOrEmail, "participantIdOrEmail"))}`;
          if (action.name === "update_participant") {
            method = "POST";
            body = values.participant;
          } else if (action.name === "delete_participant") {
            method = "DELETE";
          } else if (action.name === "trigger_referral") {
            endpoint += "/ref";
            method = "POST";
            body = { delayInDays: values.delayInDays };
          } else if (action.name === "cancel_delayed_referral") {
            endpoint += "/ref";
            method = "DELETE";
          }
      }
    }
    return request({ ...context, endpoint, method, body, query });
  },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const team = await request({
      endpoint: "/team",
      method: "GET",
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher,
      signal,
    });
    const name = optionalRawString(team.name);
    if (!name?.trim()) {
      throw providerResponseError("GrowSurf team response is missing name");
    }
    return {
      profile: { displayName: name },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/team" },
    };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("growsurf", handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "growsurf",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, `Provider request failed with HTTP ${response.status}`),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "user-agent": providerUserAgent }))
      if (!headers.has(name)) headers.set(name, value);
  },
});
