import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { twelveDataActionHandlers, twelveDataApiBaseUrl, validateTwelveDataCredential } from "./runtime.ts";

const service = "twelve_data";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, twelveDataActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: twelveDataApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "apikey " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTwelveDataCredential(input.apiKey, fetcher, signal);
  },
};
