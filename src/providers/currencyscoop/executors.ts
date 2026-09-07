import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { currencyscoopActionHandlers, currencyscoopApiBaseUrl, validateCurrencyscoopCredential } from "./runtime.ts";

const service = "currencyscoop";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, currencyscoopActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: currencyscoopApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCurrencyscoopCredential(input.apiKey, fetcher, signal);
  },
};
