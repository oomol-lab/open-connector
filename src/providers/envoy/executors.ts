import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { envoyActionHandlers, envoyApiBaseUrl, validateEnvoyCredential } from "./runtime.ts";

const service = "envoy";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, envoyActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEnvoyCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: envoyApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});
