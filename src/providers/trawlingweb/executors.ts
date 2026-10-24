import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { trawlingwebActionHandlers, trawlingwebApiBaseUrl, validateTrawlingwebCredential } from "./runtime.ts";

const service = "trawlingweb";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, trawlingwebActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: trawlingwebApiBaseUrl,
  auth: { type: "api_key_query", name: "token" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTrawlingwebCredential(input.apiKey, fetcher, signal);
  },
};
