import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { firstbaseActionHandlers, firstbaseApiBaseUrl, validateFirstbaseCredential } from "./runtime.ts";

const service = "firstbase";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, firstbaseActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: firstbaseApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "ApiKey " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFirstbaseCredential(input.apiKey, fetcher, signal);
  },
};
