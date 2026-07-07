import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { bitqueryActionHandlers, bitqueryGraphqlEndpoint, validateBitqueryCredential } from "./runtime.ts";

const service = "bitquery";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bitqueryActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: new URL(bitqueryGraphqlEndpoint).origin,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateBitqueryCredential(input.apiKey, fetcher, signal);
  },
};
