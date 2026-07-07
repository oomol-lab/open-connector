import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { bugsnagActionHandlers, bugsnagApiBaseUrl, validateBugsnagCredential } from "./runtime.ts";

const service = "bugsnag";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bugsnagActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bugsnagApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "token " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBugsnagCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};
