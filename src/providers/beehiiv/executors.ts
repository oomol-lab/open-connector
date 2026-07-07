import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { beehiivActionHandlers, beehiivApiBaseUrl, validateBeehiivCredential } from "./runtime.ts";

const service = "beehiiv";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, beehiivActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: beehiivApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBeehiivCredential(input.apiKey, fetcher, signal);
  },
};
