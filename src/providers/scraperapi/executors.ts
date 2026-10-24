import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { scraperapiActionHandlers, scraperapiApiBaseUrl, validateScraperapiCredential } from "./runtime.ts";

const service = "scraperapi";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, scraperapiActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateScraperapiCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: scraperapiApiBaseUrl,
  auth: {
    type: "api_key_query",
    name: "api_key",
  },
  customizeRequest(input) {
    if (!input.headers.has("accept")) {
      input.headers.set("accept", "*/*");
    }
  },
});
