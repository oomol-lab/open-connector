import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { typefullyActionHandlers, typefullyApiBaseUrl, validateTypefullyCredential } from "./runtime.ts";

const service = "typefully";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, typefullyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: typefullyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTypefullyCredential(input.apiKey, fetcher, signal);
  },
};
