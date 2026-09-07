import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { uniswapApiActionHandlers, uniswapApiBaseUrl, validateUniswapApiCredential } from "./runtime.ts";

const service = "uniswap_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, uniswapApiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: uniswapApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateUniswapApiCredential(input.apiKey, fetcher, signal);
  },
};
