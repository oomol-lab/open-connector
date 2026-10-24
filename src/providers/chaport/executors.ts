import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { chaportActions } from "./actions.ts";

const baseUrl = "https://app.chaport.com/api/v1";
function pathId(value: string) {
  if (value === "." || value === "..") {
    throw new ProviderRequestError(400, "Chaport IDs cannot be dot segments", undefined, "invalid_input");
  }
  return encodeURIComponent(value);
}
interface ChaportRequest {
  path: string;
  query: URLSearchParams;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ path, query, apiKey, fetcher, parentSignal }: ChaportRequest) {
  return runProviderRequest({ signal: parentSignal, label: "Chaport" }, async (signal) => {
    const url = new URL(`${baseUrl}${path}`);
    url.search = query.toString();
    const response = await fetcher(url, {
      method: "GET",
      signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "user-agent": providerUserAgent,
      },
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Chaport returned a non-JSON response (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const body = optionalRecord(payload);
      const error = optionalRecord(body?.error);
      const message =
        optionalRawString(body?.message) ??
        optionalRawString(error?.message) ??
        optionalRawString(body?.error) ??
        `Chaport request failed (HTTP ${response.status})`;
      throw new ProviderRequestError(
        response.status,
        message,
        {
          code: body?.code ?? error?.code,
          links: body?.links,
        },
        "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Chaport response");
  });
}
const handlers = mapProviderActionHandlers(
  "chaport",
  chaportActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const data = dataInput;
    const query = new URLSearchParams();
    let path = "/visitors";
    if (action.name === "list_visitors") {
      if (data.page != null) query.set("page", String(data.page));
    } else {
      path += `/${pathId(String(data.visitorId))}`;
      if (action.name !== "get_visitor") {
        path += "/chats";
        if (action.name !== "get_latest_chat") path += `/${data.chatId}`;
        if (action.name === "list_chat_events" || action.name === "get_chat_event") {
          path += "/events";
          if (action.name === "get_chat_event") path += `/${pathId(String(data.eventId))}`;
        } else if (data.transcript != null) {
          query.set("transcript", String(data.transcript));
        }
      }
    }
    const payload = await request({
      path: path,
      query: query,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
    if (Array.isArray(data.eventTypes) && data.transcript !== true) {
      const result = optionalRecord(payload.result);
      if (result && Array.isArray(result.events)) {
        const types = data.eventTypes;
        return {
          ...payload,
          result: {
            ...result,
            events: result.events.flat().filter((event) => types.includes(optionalRecord(event)?.type)),
          },
        };
      }
    }
    return payload;
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("chaport", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request({
      path: "/me.json",
      query: new URLSearchParams(),
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher: fetcher,
      parentSignal: signal,
    });
    return {
      profile: { displayName: "Chaport API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/me.json" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "chaport",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({
      accept: "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Provider request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
