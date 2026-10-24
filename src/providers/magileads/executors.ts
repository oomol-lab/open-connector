import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { magileadsActionHandlers, magileadsApiBaseUrl, validateMagileadsCredential } from "./runtime.ts";

const service = "magileads";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, magileadsActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: magileadsApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMagileadsCredential(input.apiKey, fetcher, signal);
  },
};
