import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { peecActionHandlers, validatePeecCredential } from "./runtime.ts";
const service = "peec";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, peecActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.peec.ai/customer/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePeecCredential(input.apiKey, fetcher, signal);
  },
};
