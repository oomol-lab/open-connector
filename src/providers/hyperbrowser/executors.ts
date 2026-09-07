import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { hyperbrowserActionHandlers, hyperbrowserApiBaseUrl, validateHyperbrowserCredential } from "./runtime.ts";

const service = "hyperbrowser";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, hyperbrowserActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: hyperbrowserApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateHyperbrowserCredential,
};
