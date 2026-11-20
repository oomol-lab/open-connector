import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-proxy.ts";
import { executors as heyyExecutors, heyyApiBaseUrl, validateHeyyCredential } from "./runtime.ts";

export const executors: ProviderExecutors = heyyExecutors;

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "heyy",
  baseUrl: heyyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateHeyyCredential,
};
