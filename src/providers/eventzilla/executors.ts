import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { eventzillaActionHandlers, eventzillaApiBaseUrl, validateEventzillaCredential } from "./runtime.ts";

const service = "eventzilla";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, eventzillaActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: eventzillaApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEventzillaCredential(input.apiKey, fetcher, signal);
  },
};
