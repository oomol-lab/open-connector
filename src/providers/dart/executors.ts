import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { dartActionHandlers, dartApiBaseUrl, validateDartCredential } from "./runtime.ts";

const service = "dart";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dartActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dartApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDartCredential(input.apiKey, fetcher, signal);
  },
};
