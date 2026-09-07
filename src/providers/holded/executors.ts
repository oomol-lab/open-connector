import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { holdedActionHandlers, holdedApiBaseUrl, validateHoldedCredential } from "./runtime.ts";

const service = "holded";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, holdedActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: holdedApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateHoldedCredential,
};
