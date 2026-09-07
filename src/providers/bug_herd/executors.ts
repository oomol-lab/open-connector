import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { bugHerdActionHandlers, bugHerdApiBaseUrl, validateBugHerdCredential } from "./runtime.ts";

const service = "bug_herd";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bugHerdActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bugHerdApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":x" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBugHerdCredential(input.apiKey, fetcher, signal);
  },
};
