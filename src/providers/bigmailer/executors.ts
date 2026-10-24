import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { bigmailerActionHandlers, bigmailerApiBaseUrl, validateBigmailerCredential } from "./runtime.ts";

const service = "bigmailer";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bigmailerActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bigmailerApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateBigmailerCredential(input.apiKey, fetcher, signal);
  },
};
