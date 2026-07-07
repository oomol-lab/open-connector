import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { gladiaActionHandlers, gladiaApiBaseUrl, validateGladiaCredential } from "./runtime.ts";

const service = "gladia";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, gladiaActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: gladiaApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "x-gladia-key",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGladiaCredential(input, fetcher, signal);
  },
};
