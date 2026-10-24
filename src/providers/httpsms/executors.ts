import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { httpsmsActionHandlers, httpsmsApiBaseUrl, validateHttpsmsCredential } from "./runtime.ts";

const service = "httpsms";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, httpsmsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: httpsmsApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateHttpsmsCredential(input.apiKey, fetcher, signal);
  },
};
