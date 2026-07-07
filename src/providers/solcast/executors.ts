import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { solcastActionHandlers, solcastApiBaseUrl, validateSolcastCredential } from "./runtime.ts";

const service = "solcast";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, solcastActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: solcastApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSolcastCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
