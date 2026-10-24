import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { hrPartnerActionHandlers, hrPartnerApiBaseUrl, validateHrPartnerCredential } from "./runtime.ts";

const service = "hr_partner";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, hrPartnerActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: hrPartnerApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateHrPartnerCredential(input.apiKey, fetcher, signal);
  },
};
