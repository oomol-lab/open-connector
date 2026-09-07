import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { ripplingActionHandlers, ripplingApiBaseUrl, validateRipplingCredential } from "./runtime.ts";

const service = "rippling";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ripplingActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ripplingApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateRipplingCredential(input.apiKey, fetcher, signal);
  },
};
