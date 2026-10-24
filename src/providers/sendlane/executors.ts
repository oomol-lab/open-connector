import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { sendlaneActionHandlers, sendlaneApiBaseUrl, validateSendlaneCredential } from "./runtime.ts";

const service = "sendlane";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, sendlaneActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sendlaneApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateSendlaneCredential(input.apiKey, fetcher);
  },
};
