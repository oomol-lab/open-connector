import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { createProviderFetch, defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { photoroomActionHandlers, photoroomApiBaseUrl, validatePhotoroomCredential } from "./runtime.ts";

const service = "photoroom";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, photoroomActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: photoroomApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      skipDnsValidation: true,
    });
    return validatePhotoroomCredential(input.apiKey, guardedFetcher, signal);
  },
};
