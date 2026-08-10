import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { supadataActionHandlers, validateSupadataCredential } from "./runtime.ts";

const service = "supadata";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, supadataActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSupadataCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.supadata.ai/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
});
