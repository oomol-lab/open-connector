import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { knockActionHandlers, knockApiBaseUrl, validateKnockCredential } from "./runtime.ts";

const service = "knock";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, knockActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: knockApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKnockCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
