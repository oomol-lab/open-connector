import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { everhourActionHandlers, everhourApiBaseUrl, validateEverhourCredential } from "./runtime.ts";

const service = "everhour";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, everhourActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: everhourApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEverhourCredential(input.apiKey, fetcher, signal);
  },
};
