import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { optimorouteActionHandlers, optimorouteApiBaseUrl, validateOptimorouteCredential } from "./runtime.ts";

const service = "optimoroute";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, optimorouteActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: optimorouteApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOptimorouteCredential(input.apiKey, fetcher, signal);
  },
};
