import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tmdbActionHandlers, tmdbApiBaseUrl, validateTmdbCredential } from "./runtime.ts";

const service = "tmdb";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tmdbApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tmdbActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTmdbCredential(input.apiKey, fetcher, signal);
  },
};
