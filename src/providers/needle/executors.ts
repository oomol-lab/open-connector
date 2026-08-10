import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { needleActionHandlers, validateNeedleCredential } from "./runtime.ts";

const service = "needle";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, needleActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNeedleCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://needle.app",
  auth: { type: "api_key_header", name: "x-api-key" },
});
