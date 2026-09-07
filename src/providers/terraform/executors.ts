import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { terraformActionHandlers, terraformApiBaseUrl, validateTerraformCredential } from "./runtime.ts";

const service = "terraform";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, terraformActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: terraformApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/vnd.api+json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/vnd.api+json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTerraformCredential(input.apiKey, fetcher, signal);
  },
};
