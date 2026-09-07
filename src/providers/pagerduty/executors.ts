import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { pagerDutyActionHandlers, pagerDutyApiBaseUrl, validatePagerDutyCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pagerduty", pagerDutyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pagerduty",
  baseUrl: pagerDutyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token token=" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/vnd.pagerduty+json;version=2");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validatePagerDutyCredential({ apiKey: input.apiKey }, fetcher);
  },
};
