import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { quantDataActionHandlers, validateQuantDataCredential } from "./runtime.ts";
const service = "quant_data";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, quantDataActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.quantdata.us",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateQuantDataCredential(input.apiKey, fetcher, signal);
  },
};
