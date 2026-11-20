import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { timecampActionHandlers, timecampApiBaseUrl, validateTimecampCredential } from "./runtime.ts";

const service = "timecamp";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: timecampApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, timecampActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateTimecampCredential(input.apiKey, fetcher, signal);
  },
};
