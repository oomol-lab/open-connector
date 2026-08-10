import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateYouCredential, youActionHandlers } from "./runtime.ts";

const service = "you";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, youActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateYouCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.you.com/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
});
