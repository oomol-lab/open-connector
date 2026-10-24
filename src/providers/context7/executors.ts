import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { context7ActionHandlers, context7ApiBaseUrl, validateContext7Credential } from "./runtime.ts";

const service = "context7";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, context7ActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: context7ApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateContext7Credential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
