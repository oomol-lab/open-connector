import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { mem0ActionHandlers, mem0ApiBaseUrl, validateMem0ApiKey } from "./runtime.ts";

const service = "mem0";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mem0ActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mem0ApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMem0ApiKey(input.apiKey, fetcher, signal);
  },
};
