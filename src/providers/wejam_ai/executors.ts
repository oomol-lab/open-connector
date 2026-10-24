import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { validateWejamAiCredential, wejamAiActionHandlers, wejamAiApiBaseUrl } from "./runtime.ts";

const service = "wejam_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, wejamAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wejamAiApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWejamAiCredential(input.apiKey, fetcher, signal);
  },
};
