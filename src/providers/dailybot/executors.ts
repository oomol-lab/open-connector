import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { dailybotActionHandlers, dailybotApiBaseUrl, validateDailybotCredential } from "./runtime.ts";

const service = "dailybot";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dailybotActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dailybotApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDailybotCredential(input.apiKey, fetcher, signal);
  },
};
