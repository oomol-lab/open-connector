import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { slicktextActionHandlers, slicktextApiBaseUrl, validateSlicktext } from "./runtime.ts";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("slicktext", slicktextActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "slicktext",
  baseUrl: slicktextApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSlicktext({ apiKey: input.apiKey, fetcher, signal });
  },
};
