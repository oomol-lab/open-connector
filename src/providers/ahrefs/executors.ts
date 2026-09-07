import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { ahrefsActionHandlers, ahrefsApiBaseUrl, validateAhrefsCredential } from "./runtime.ts";

const service = "ahrefs";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ahrefsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ahrefsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAhrefsCredential(input.apiKey, fetcher, signal);
  },
};
