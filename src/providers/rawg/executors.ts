import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { rawgActionHandlers, rawgApiBaseUrl, validateRawgCredential } from "./runtime.ts";

const service = "rawg";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, rawgActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: rawgApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateRawgCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
