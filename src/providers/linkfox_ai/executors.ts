import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { apiBaseUrl, linkfoxAiHandlers, validateLinkfoxAiCredential } from "./runtime.ts";

const service = "linkfox_ai";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, linkfoxAiHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLinkfoxAiCredential(input.apiKey, fetcher, signal);
  },
};
