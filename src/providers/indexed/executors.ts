import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { indexedActionHandlers, indexedApiBaseUrl, readIndexedError, validateIndexedCredential } from "./runtime.ts";

const service = "indexed";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, indexedActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: indexedApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  readError: readIndexedError,
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateIndexedCredential,
};
