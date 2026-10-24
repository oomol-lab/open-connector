import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { timebuzzerActionHandlers, timebuzzerApiBaseUrl, validateTimebuzzerCredential } from "./runtime.ts";

const service = "timebuzzer";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, timebuzzerActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: timebuzzerApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "APIKey " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTimebuzzerCredential(input.apiKey, fetcher, signal);
  },
};
