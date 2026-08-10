import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { gigasheetActionHandlers, validateGigasheetCredential } from "./runtime.ts";

const service = "gigasheet";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, gigasheetActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGigasheetCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.gigasheet.com",
  auth: { type: "api_key_header", name: "x-gigasheet-token" },
});
