import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { streamEstateActionHandlers, streamEstateApiBaseUrl, validateStreamEstateCredential } from "./runtime.ts";

const service = "stream_estate";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, streamEstateActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: streamEstateApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateStreamEstateCredential(input.apiKey, fetcher, signal);
  },
};
