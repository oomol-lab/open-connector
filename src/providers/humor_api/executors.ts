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
import { humorApiActions } from "./actions.ts";

const baseUrl = "https://api.humorapi.com";
const actionPaths: Record<string, string> = {
  search_jokes: "/jokes/search",
  random_joke: "/jokes/random",
  search_memes: "/memes/search",
  random_meme: "/memes/random",
  search_gifs: "/gif/search",
};
const handlers = mapProviderActionHandlers(
  "humor_api",
  humorApiActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const url = new URL(actionPaths[action.name]!, baseUrl);
    for (const [name, value] of Object.entries(dataInput)) {
      if (value != null) url.searchParams.set(name, String(value));
    }
    const apiKey = context.apiKey;
    return runProviderRequest({ signal: context.signal, label: "Humor API" }, async (signal) => {
      const response = await context.fetcher(url, {
        headers: {
          "x-api-key": apiKey,
          accept: "application/json",
          "user-agent": providerUserAgent,
        },
        signal,
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        if (response.ok)
          throw new ProviderRequestError(502, "Humor API returned invalid JSON", undefined, "provider_error");
      }
      if (!response.ok) {
        const body = optionalRecord(payload);
        const message =
          optionalRawString(body?.message) ??
          optionalRawString(body?.error) ??
          `Humor API request failed (HTTP ${response.status})`;
        throw new ProviderRequestError(
          response.status,
          message,
          undefined,
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      return requiredResponseRecord(payload, "Humor API response");
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("humor_api", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "API Key");
    return {
      profile: { displayName: "Humor API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "local_non_empty_key" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "humor_api",
  baseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
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
