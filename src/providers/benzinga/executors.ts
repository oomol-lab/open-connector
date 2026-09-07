import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { benzingaActionHandlers, validateBenzingaCredential } from "./runtime.ts";

const service = "benzinga";
const benzingaApiBaseUrl = "https://api.benzinga.com";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, benzingaActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: benzingaApiBaseUrl,
  auth: { type: "api_key_query", name: "token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBenzingaCredential(input.apiKey, fetcher, signal);
  },
};
