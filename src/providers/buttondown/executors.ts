import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { buttondownActionHandlers, buttondownApiBaseUrl, validateButtondownCredential } from "./runtime.ts";

const service = "buttondown";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, buttondownActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: buttondownApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateButtondownCredential(input.apiKey, fetcher, signal);
  },
};
