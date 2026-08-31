import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { scrapeCreatorsActionHandlers, validateScrapeCreatorsCredential } from "./runtime.ts";

const service = "scrape_creators";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, scrapeCreatorsActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateScrapeCreatorsCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.scrapecreators.com",
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});
