import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { eventeeActionHandlers, eventeeApiBaseUrl, validateEventeeCredential } from "./runtime.ts";

const service = "eventee";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, eventeeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: eventeeApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEventeeCredential(input.apiKey, fetcher, signal);
  },
};
