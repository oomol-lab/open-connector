import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { eveniumActionHandlers, eveniumApiBaseUrl, validateEveniumCredential } from "./runtime.ts";

const service = "evenium";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, eveniumActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: eveniumApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Evenium-Token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEveniumCredential(input.apiKey, fetcher, signal);
  },
};
