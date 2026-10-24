import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { productFruitsActionHandlers, productFruitsApiBaseUrl, validateProductFruitsCredential } from "./runtime.ts";

const service = "product_fruits";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, productFruitsActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: productFruitsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateProductFruitsCredential(input.apiKey, fetcher, signal);
  },
};
