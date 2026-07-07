import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { statsigActionHandlers, statsigApiBaseUrl, statsigApiVersion, validateStatsigCredential } from "./runtime.ts";

const service = "statsig";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, statsigActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: statsigApiBaseUrl,
  auth: { type: "api_key_header", name: "STATSIG-API-KEY" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("statsig-api-version", statsigApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateStatsigCredential(input.apiKey, fetcher, signal);
  },
};
