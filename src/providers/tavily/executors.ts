import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tavilyActionHandlers, tavilyApiBaseUrl, validateTavilyCredential } from "./runtime.ts";

const service = "tavily";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tavilyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tavilyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTavilyCredential,
};
