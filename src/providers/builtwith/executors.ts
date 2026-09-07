import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { builtwithActionHandlers, builtwithApiBaseUrl, validateBuiltwithCredential } from "./runtime.ts";

const service = "builtwith";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, builtwithActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: builtwithApiBaseUrl,
  auth: { type: "api_key_query", name: "KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBuiltwithCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};
