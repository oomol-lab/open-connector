import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { iqairAirvisualActionHandlers, iqairAirvisualApiBaseUrl, validateIqairAirvisualCredential } from "./runtime.ts";

const service = "iqair_airvisual";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, iqairAirvisualActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: iqairAirvisualApiBaseUrl,
  auth: {
    type: "api_key_query",
    name: "key",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateIqairAirvisualCredential,
};
