import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord, optionalRawString, optionalNumber } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
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

const baseUrl = "https://api.validemail.net";

async function request(
  endpoint: string,
  apiKey: string,
  email: string | undefined,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest(
    { label: "ValidEmail", timeoutMs: email === undefined ? undefined : 90_000, signal: parentSignal },
    async (signal) => {
      const url = new URL(endpoint, baseUrl);
      url.searchParams.set("token", apiKey);
      if (email !== undefined) {
        url.searchParams.set("email", email);
      }
      const response = await fetcher(url, {
        method: "GET",
        headers: { accept: "application/json", "user-agent": providerUserAgent },
        signal,
      });
      const text = await readProviderTextBody(response, "validemail response", undefined, signal);
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      if (!response.ok) {
        const record = optionalRecord(payload);
        const message =
          optionalRawString(record?.message) ?? optionalRawString(record?.error) ?? optionalRawString(payload) ?? text;
        throw new ProviderRequestError(
          response.status,
          (message.trim() || `ValidEmail request failed with status ${response.status}`)
            .split(apiKey)
            .join("[REDACTED]"),
          undefined,
          response.status === 429 ? "rate_limited" : "provider_error",
        );
      }
      return requiredResponseRecord(payload, "ValidEmail response");
    },
  );
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "validemail",
  {
    get_balance(_input, context) {
      return request("/balance", context.apiKey, undefined, context.fetcher, context.signal);
    },
    verify_email(input, context) {
      return request("/", context.apiKey, optionalRawString(input.email), context.fetcher, context.signal);
    },
  },
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await request("/balance", requiredInputString(input.apiKey, "API Key"), undefined, fetcher, signal);
    if (optionalNumber(payload.balance) === undefined) {
      throw providerResponseError("ValidEmail balance response is missing balance");
    }
    return {
      profile: { displayName: "ValidEmail API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/balance" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "validemail",
  baseUrl,
  auth: { type: "api_key_query", name: "token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "user-agent": providerUserAgent }))
      if (!headers.has(name)) headers.set(name, value);
  },
});
