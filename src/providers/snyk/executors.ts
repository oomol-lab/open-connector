import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { snykActionHandlers, snykApiBaseUrl, validateSnykCredential } from "./runtime.ts";

const service = "snyk";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, snykActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: snykApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "token " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/vnd.api+json");
    headers.set("content-type", "application/vnd.api+json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSnykCredential(input.apiKey, fetcher, signal);
  },
};
