import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { heyreachActionHandlers, heyreachApiBaseUrl, validateHeyreachCredential } from "./runtime.ts";

const service = "heyreach";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, heyreachActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: heyreachApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateHeyreachCredential(input.apiKey, fetcher, signal);
  },
};
