import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { deutschlandgptActionHandlers, deutschlandgptApiBaseUrl, validateDeutschlandgptCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "deutschlandgpt",
  deutschlandgptActionHandlers,
  {
    skipDnsValidation: true,
  },
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "deutschlandgpt",
  baseUrl: deutschlandgptApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDeutschlandgptCredential(input.apiKey, fetcher, signal);
  },
};
