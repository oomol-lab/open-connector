import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWhoisfreaksCredential, whoisfreaksActionHandlers, whoisfreaksApiBaseUrl } from "./runtime.ts";

const service = "whoisfreaks";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, whoisfreaksActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: whoisfreaksApiBaseUrl,
  auth: { type: "api_key_query", name: "apiKey" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWhoisfreaksCredential(input.apiKey, fetcher, signal);
  },
};
