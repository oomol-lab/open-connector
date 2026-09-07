import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { leadfeederActionHandlers, leadfeederApiBaseUrl, validateLeadfeederCredential } from "./runtime.ts";

const service = "leadfeeder";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, leadfeederActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: leadfeederApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Api-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLeadfeederCredential(input.apiKey, fetcher, signal);
  },
};
