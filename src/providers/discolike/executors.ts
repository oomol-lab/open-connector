import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { discolikeActionHandlers, discolikeApiBaseUrl, validateDiscolikeCredential } from "./runtime.ts";

const service = "discolike";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, discolikeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: discolikeApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDiscolikeCredential(input.apiKey, fetcher, signal);
  },
};
