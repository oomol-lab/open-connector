import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { theCatApiActionHandlers, theCatApiBaseUrl, validateTheCatApiCredential } from "./runtime.ts";

const service = "the_cat_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, theCatApiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: theCatApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTheCatApiCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
