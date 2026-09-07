import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { daffyActionHandlers, daffyApiBaseUrl, validateDaffyCredential } from "./runtime.ts";

const service = "daffy";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, daffyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: daffyApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Api-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDaffyCredential(input.apiKey, fetcher, signal);
  },
};
