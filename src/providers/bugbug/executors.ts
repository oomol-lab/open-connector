import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { bugbugActionHandlers, bugbugApiBaseUrl, validateBugbugCredential } from "./runtime.ts";

const service = "bugbug";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bugbugActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bugbugApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBugbugCredential(input.apiKey, fetcher, signal);
  },
};
