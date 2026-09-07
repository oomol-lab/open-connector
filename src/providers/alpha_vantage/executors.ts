import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { alphaVantageActionHandlers, alphaVantageApiBaseUrl, validateAlphaVantageCredential } from "./runtime.ts";

const service = "alpha_vantage";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, alphaVantageActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: alphaVantageApiBaseUrl,
  auth: { type: "api_key_query", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAlphaVantageCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
