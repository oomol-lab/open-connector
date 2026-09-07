import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { cuttlyApiBaseUrl, cuttLyActionHandlers, validateCuttlyCredential } from "./runtime.ts";

const service = "cutt_ly";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cuttLyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cuttlyApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCuttlyCredential(input.apiKey, fetcher, signal);
  },
};
