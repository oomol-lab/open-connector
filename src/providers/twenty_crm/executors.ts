import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { twentyCrmActionHandlers, twentyCrmApiBaseUrl, validateTwentyCrmCredential } from "./runtime.ts";

const service = "twenty_crm";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: twentyCrmApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, twentyCrmActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTwentyCrmCredential(input.apiKey, fetcher, signal);
  },
};
