import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { granolaActionHandlers, granolaApiBaseUrl, validateGranolaCredential } from "./runtime.ts";

const service = "granola";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, granolaActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: granolaApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateGranolaCredential(input.apiKey, fetcher, signal);
  },
};
