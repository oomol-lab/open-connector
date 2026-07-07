import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tomtomActionHandlers, tomtomApiBaseUrl, validateTomtomCredential } from "./runtime.ts";

const service = "tomtom";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tomtomActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tomtomApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTomtomCredential,
};
