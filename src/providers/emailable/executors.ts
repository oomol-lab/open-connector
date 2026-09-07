import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { emailableActionHandlers, emailableApiBaseUrl, validateEmailableCredential } from "./runtime.ts";

const service = "emailable";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, emailableActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: emailableApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEmailableCredential(input.apiKey, fetcher, signal);
  },
};
