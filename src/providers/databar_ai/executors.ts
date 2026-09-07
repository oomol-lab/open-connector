import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { databarAiActionHandlers, databarAiApiBaseUrl, validateDatabarAiCredential } from "./runtime.ts";

const service = "databar_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, databarAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: databarAiApiBaseUrl,
  auth: { type: "api_key_header", name: "x-apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDatabarAiCredential(input.apiKey, fetcher, signal);
  },
};
