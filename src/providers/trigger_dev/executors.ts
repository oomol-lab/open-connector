import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { triggerDevActionHandlers, triggerDevApiBaseUrl, validateTriggerDevCredential } from "./runtime.ts";

const service = "trigger_dev";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: triggerDevApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, triggerDevActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTriggerDevCredential(input.apiKey, fetcher, signal);
  },
};
