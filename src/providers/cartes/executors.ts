import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { cartesActionHandlers, cartesApiBaseUrl, validateCartesCredential } from "./runtime.ts";

const service = "cartes";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cartesActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cartesApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCartesCredential(input.apiKey, fetcher, signal);
  },
};
