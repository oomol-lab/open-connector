import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
const apiBaseUrl = "https://api.nationalize.io";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "nationalize",
  {
    async predict_nationality(input, context) {
      return requiredResponseRecord(
        await requestNationalize(
          context.apiKey,
          new URLSearchParams({ name: requiredInputString(input.name, "name") }),
          context.fetcher,
          false,
          context.signal,
        ),
        "Nationalize prediction",
      );
    },
    async predict_nationality_batch(input, context) {
      const names = input.names as string[];
      const query = new URLSearchParams();
      for (const name of names) query.append("name[]", requiredInputString(name, "names"));
      const payload = await requestNationalize(context.apiKey, query, context.fetcher, false, context.signal);
      if (!Array.isArray(payload) || payload.length !== names.length)
        throw new ProviderRequestError(502, "Nationalize returned an incomplete prediction batch");
      return { predictions: payload.map((item) => requiredResponseRecord(item, "Nationalize prediction")) };
    },
  },
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    requiredResponseRecord(
      await requestNationalize(input.apiKey, new URLSearchParams({ name: "nguyen" }), fetcher, true, signal),
      "Nationalize credential validation",
    );
    return { profile: { displayName: "Nationalize API Key" }, grantedScopes: [], metadata: { apiBaseUrl } };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "nationalize",
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_query", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
async function requestNationalize(
  apiKey: string,
  query: URLSearchParams,
  fetcher: typeof fetch,
  validating = false,
  parentSignal?: AbortSignal,
) {
  const url = new URL(apiBaseUrl);
  url.search = query.toString();
  url.searchParams.set("apikey", apiKey);
  return runProviderRequest({ label: "Nationalize", signal: parentSignal }, async (signal) => {
    const response = await fetcher(url, {
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal,
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Nationalize returned a non-JSON response (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    const error = optionalString(optionalRecord(payload)?.error);
    if (!response.ok || error) {
      if (response.status === 401 && error === "Invalid API key") {
        throw new ProviderRequestError(validating ? 400 : 401, "Nationalize: Invalid API key");
      }
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Nationalize: ${error || `request failed with HTTP ${response.status}`}`,
        undefined,
        "provider_error",
      );
    }
    return payload;
  });
}
