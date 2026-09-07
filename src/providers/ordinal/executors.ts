import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { ordinalActionHandlers, ordinalApiBaseUrl, validateOrdinalCredential } from "./runtime.ts";

const service = "ordinal";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ordinalActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ordinalApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOrdinalCredential(input.apiKey, fetcher, signal);
  },
};
