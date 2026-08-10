import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { e2bActionHandlers, validateE2bCredential } from "./runtime.ts";

const service = "e2b";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, e2bActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateE2bCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.e2b.app",
  auth: { type: "api_key_header", name: "x-api-key" },
});
