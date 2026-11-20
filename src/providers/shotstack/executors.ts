import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { shotstackActionHandlers, shotstackProxyBaseUrl, validateShotstackCredential } from "./runtime.ts";

const service = "shotstack";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shotstackActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateShotstackCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: shotstackProxyBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  defaultHeaders: { accept: "application/json" },
});
