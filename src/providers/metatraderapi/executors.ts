import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { metatraderapiActionHandlers, metatraderapiApiBaseUrl, validateMetaTraderApiCredential } from "./runtime.ts";

const service = "metatraderapi";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, metatraderapiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: metatraderapiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMetaTraderApiCredential(input.apiKey, fetcher, signal);
  },
};
