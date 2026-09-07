import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { browserlessActionHandlers, browserlessApiBaseUrl, validateBrowserlessCredential } from "./runtime.ts";

const service = "browserless";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, browserlessActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: browserlessApiBaseUrl,
  auth: { type: "api_key_query", name: "token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("cache-control", "no-cache");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBrowserlessCredential(input.apiKey, fetcher, signal);
  },
};
