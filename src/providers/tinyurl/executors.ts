import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tinyurlActionHandlers, tinyurlApiBaseUrl, validateTinyurlCredential } from "./runtime.ts";

const service = "tinyurl";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tinyurlActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tinyurlApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateTinyurlCredential(input.apiKey, fetcher, signal);
  },
};
