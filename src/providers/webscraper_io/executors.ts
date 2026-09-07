import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWebscraperIoCredential, webscraperIoActionHandlers, webscraperIoApiBaseUrl } from "./runtime.ts";

const service = "webscraper_io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, webscraperIoActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: webscraperIoApiBaseUrl,
  auth: { type: "api_key_query", name: "api_token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWebscraperIoCredential(input.apiKey, fetcher, signal);
  },
};
