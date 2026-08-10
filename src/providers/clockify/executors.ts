import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { clockifyActionHandlers, validateClockifyCredential } from "./runtime.ts";

const service = "clockify";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, clockifyActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateClockifyCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.clockify.me/api/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
});
