import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { lushaActionHandlers, lushaApiBaseUrl, validateLushaCredential } from "./runtime.ts";

const service = "lusha";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lushaActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: lushaApiBaseUrl,
  auth: { type: "api_key_header", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLushaCredential(input.apiKey, fetcher, signal);
  },
};
