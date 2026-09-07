import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateZixflowCredential, zixflowActionHandlers, zixflowApiBaseUrl } from "./runtime.ts";

const service = "zixflow";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zixflowApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zixflowActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateZixflowCredential(input.apiKey, fetcher, signal);
  },
};
