import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { bitriseActionHandlers, bitriseApiBaseUrl, validateBitriseCredential } from "./runtime.ts";

const service = "bitrise";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bitriseActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBitriseCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bitriseApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "Authorization",
  },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});
