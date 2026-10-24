import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { bloomerangActionHandlers, bloomerangApiBaseUrl, validateBloomerangCredential } from "./runtime.ts";

const service = "bloomerang";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bloomerangActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bloomerangApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateBloomerangCredential(input.apiKey, fetcher, signal);
  },
};
