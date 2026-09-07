import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { taxjarActionHandlers, taxjarApiBaseUrl, validateTaxjarCredential } from "./runtime.ts";

const service = "taxjar";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, taxjarActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: taxjarApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("x-api-version")) {
      headers.set("x-api-version", "2022-01-24");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTaxjarCredential,
};
