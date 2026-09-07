import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { attentionActionHandlers, attentionApiBaseUrl, validateAttentionCredential } from "./runtime.ts";

const service = "attention";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, attentionActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: attentionApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateAttentionCredential(input.apiKey, fetcher, signal);
  },
};
