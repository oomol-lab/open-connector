import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { manusActionHandlers, validateManusCredential } from "./runtime.ts";

const service = "manus";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, manusActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateManusCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.manus.ai",
  auth: { type: "api_key_header", name: "x-manus-api-key" },
});
