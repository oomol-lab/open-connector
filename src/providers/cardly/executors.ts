import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { cardlyActionHandlers, validateCardlyCredential } from "./runtime.ts";

const service = "cardly";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cardlyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateCardlyCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.card.ly/v2",
  auth: { type: "api_key_header", name: "api-key" },
});
