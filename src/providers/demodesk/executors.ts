import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { demodeskActionHandlers, demodeskApiBaseUrl, validateDemodeskCredential } from "./runtime.ts";

const service = "demodesk";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, demodeskActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: demodeskApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDemodeskCredential(input.apiKey, fetcher, signal);
  },
};
