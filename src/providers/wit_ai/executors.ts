import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWitAiCredential, witAiActionHandlers, witAiApiBaseUrl, witAiApiVersion } from "./runtime.ts";

const service = "wit_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, witAiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: witAiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ url }) {
    url.searchParams.set("v", witAiApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWitAiCredential(input.apiKey, fetcher, signal);
  },
};
