import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredResponseRecord, runProviderRequest, ProviderRequestError } from "../provider-runtime.ts";
const apiBaseUrl = "https://api.agify.io";
interface AgifyInput {
  name?: string;
  names?: string[];
  country_id?: string;
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "agify",
  {
    async predict_age(input, context) {
      return requiredResponseRecord(
        await requestAgify(input as AgifyInput, context.apiKey, context.fetcher, false),
        "Agify prediction response",
      );
    },
    async predict_age_batch(input, context) {
      const predictions = await requestAgify(input as AgifyInput, context.apiKey, context.fetcher, false);
      if (!Array.isArray(predictions)) throw new ProviderRequestError(502, "Agify batch response must be an array");
      return { predictions };
    },
  },
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  service: "agify",
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_query", name: "apikey" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await requestAgify({ name: "michael" }, input.apiKey, fetcher, true);
    return { profile: { accountId: "api_key", displayName: "Agify API Key" }, metadata: {} };
  },
};
async function requestAgify(input: AgifyInput, apiKey: string, fetcher: typeof fetch, validating: boolean) {
  const url = new URL(apiBaseUrl);
  url.searchParams.set("apikey", apiKey);
  if (input.name !== undefined) {
    url.searchParams.set("name", input.name);
  }
  for (const name of input.names ?? []) {
    url.searchParams.append("name[]", name);
  }
  if (input.country_id !== undefined) {
    url.searchParams.set("country_id", input.country_id.toUpperCase());
  }
  return runProviderRequest({ label: "Agify" }, async (signal) => {
    const response = await fetcher(url, { headers: { accept: "application/json" }, signal });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        "Agify returned a non-JSON response",
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const message = optionalString(optionalRecord(payload)?.error) ?? `Agify request failed (${response.status})`;
      if (response.status === 401 && message === "Invalid API key") {
        throw new ProviderRequestError(
          validating ? 400 : 401,
          message,
          undefined,
          validating ? "invalid_input" : "authorization_failed",
        );
      }
      if (response.status === 429) {
        throw new ProviderRequestError(429, message, undefined, "rate_limited");
      }
      throw new ProviderRequestError(response.status, message, undefined, "provider_error");
    }
    return payload;
  });
}
