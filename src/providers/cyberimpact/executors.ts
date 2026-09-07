import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { cyberimpactActionHandlers, cyberimpactApiBaseUrl, validateCyberimpactCredential } from "./runtime.ts";

const service = "cyberimpact";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cyberimpactActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cyberimpactApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateCyberimpactCredential(input.apiKey, fetcher, signal);
  },
};
