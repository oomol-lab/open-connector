import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { betterStackActionHandlers, validateBetterStackCredential } from "./runtime.ts";

const service = "better_stack";
const betterStackApiBaseUrl = "https://uptime.betterstack.com";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, betterStackActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: betterStackApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBetterStackCredential(input.apiKey, fetcher, signal);
  },
};
