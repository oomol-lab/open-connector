import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { twochatActionHandlers, validateTwochatCredential } from "./runtime.ts";

const service = "twochat";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, twochatActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTwochatCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.p.2chat.io",
  auth: { type: "api_key_header", name: "x-user-api-key" },
});
