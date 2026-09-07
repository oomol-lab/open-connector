import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { gtmetrixActionHandlers, gtmetrixApiBaseUrl, validateGtmetrixCredential } from "./runtime.ts";

const service = "gtmetrix";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: gtmetrixApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/vnd.api+json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, gtmetrixActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateGtmetrixCredential(input.apiKey, fetcher, signal);
  },
};
