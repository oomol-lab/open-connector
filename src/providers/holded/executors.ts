import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { holdedActionHandlers, holdedApiBaseUrl, validateHoldedCredential } from "./runtime.ts";

const service = "holded";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, holdedActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: holdedApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateHoldedCredential,
};
