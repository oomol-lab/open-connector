import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { beamerActionHandlers, validateBeamerCredential } from "./runtime.ts";

const service = "beamer";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, beamerActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBeamerCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.getbeamer.com/v0",
  auth: { type: "api_key_header", name: "beamer-api-key" },
});
