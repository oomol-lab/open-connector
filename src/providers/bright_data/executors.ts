import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { brightDataActionHandlers, brightDataApiBaseUrl, validateBrightDataCredential } from "./runtime.ts";

const service = "bright_data";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, brightDataActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: brightDataApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBrightDataCredential(input.apiKey, fetcher, signal);
  },
};
