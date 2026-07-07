import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tapfiliateActionHandlers, tapfiliateApiBaseUrl, validateTapfiliateCredential } from "./runtime.ts";

const service = "tapfiliate";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tapfiliateActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tapfiliateApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Api-Key" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTapfiliateCredential(input.apiKey, fetcher, signal);
  },
};
