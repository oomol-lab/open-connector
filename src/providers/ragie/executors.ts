import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { ragieActionHandlers, ragieApiBaseUrl, validateRagieCredential } from "./runtime.ts";

const service = "ragie";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ragieActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ragieApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateRagieCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
