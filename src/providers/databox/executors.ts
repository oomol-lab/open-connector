import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { databoxActionHandlers, validateDataboxCredential } from "./runtime.ts";

const service = "databox";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, databoxActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDataboxCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.databox.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
