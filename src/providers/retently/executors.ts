import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { retentlyActionHandlers, validateRetentlyCredential } from "./runtime.ts";

const service = "retently";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, retentlyActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateRetentlyCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://app.retently.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
