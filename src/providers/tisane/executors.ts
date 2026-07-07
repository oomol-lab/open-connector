import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tisaneActionHandlers, tisaneApiBaseUrl, tisaneApiKeyHeader, validateTisaneCredential } from "./runtime.ts";

const service = "tisane";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tisaneActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tisaneApiBaseUrl,
  auth: { type: "api_key_header", name: tisaneApiKeyHeader },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateTisaneCredential(input.apiKey, fetcher, signal);
  },
};
