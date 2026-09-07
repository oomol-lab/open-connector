import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tripadvisorActionHandlers, tripadvisorApiBaseUrl, validateTripadvisorCredential } from "./runtime.ts";

const service = "tripadvisor";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tripadvisorActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tripadvisorApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTripadvisorCredential,
};
