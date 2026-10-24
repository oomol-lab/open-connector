import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { aivoovActionHandlers, validateAivoovCredential } from "./runtime.ts";

const service = "aivoov";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, aivoovActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAivoovCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://aivoov.com/api/v8",
  auth: { type: "api_key_header", name: "x-api-key" },
});
