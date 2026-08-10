import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { superchatActionHandlers, validateSuperchatCredential } from "./runtime.ts";

const service = "superchat";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, superchatActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSuperchatCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.superchat.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
