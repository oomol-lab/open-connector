import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { twittrapiActionHandlers, twittrapiApiBaseUrl, validateTwittrapiCredential } from "./runtime.ts";

const service = "twittrapi";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, twittrapiActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: twittrapiApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTwittrapiCredential(input.apiKey, fetcher, signal);
  },
};
