import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { slickdealsActionHandlers, slickdealsApiBaseUrl, validateSlickdealsCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("slickdeals", slickdealsActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "slickdeals",
  baseUrl: slickdealsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSlickdealsCredential(input.apiKey, fetcher, signal);
  },
};
