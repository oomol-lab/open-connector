import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { fiberAiActionHandlers, fiberAiApiBaseUrl, validateFiberAiCredential } from "./runtime.ts";

const service = "fiber_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fiberAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: fiberAiApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFiberAiCredential(input.apiKey, fetcher, signal);
  },
};
