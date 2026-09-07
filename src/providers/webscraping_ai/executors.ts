import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWebscrapingAiCredential, webscrapingAiActionHandlers, webscrapingAiApiBaseUrl } from "./runtime.ts";

const service = "webscraping_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, webscrapingAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: webscrapingAiApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/html, text/plain, */*");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWebscrapingAiCredential(input.apiKey, fetcher, signal);
  },
};
