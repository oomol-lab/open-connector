import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { loopReturnsActionHandlers, loopReturnsApiBaseUrl, validateLoopReturnsCredential } from "./runtime.ts";

const service = "loop_returns";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, loopReturnsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: loopReturnsApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLoopReturnsCredential(input.apiKey, fetcher, signal);
  },
};
