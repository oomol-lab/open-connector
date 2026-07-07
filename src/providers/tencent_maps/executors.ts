import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tencentMapsActionHandlers, tencentMapsApiBaseUrl, validateTencentMapsCredential } from "./runtime.ts";

const service = "tencent_maps";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tencentMapsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tencentMapsApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTencentMapsCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
