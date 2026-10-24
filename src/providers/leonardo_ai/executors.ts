import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { leonardoAiActionHandlers, leonardoAiApiRootUrl, validateLeonardoAiCredential } from "./runtime.ts";

const service = "leonardo_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, leonardoAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: leonardoAiApiRootUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLeonardoAiCredential(input.apiKey, fetcher, signal);
  },
};
