import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { dumplingaiActionHandlers, dumplingaiApiBaseUrl, validateDumplingaiCredential } from "./runtime.ts";

const service = "dumplingai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dumplingaiActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dumplingaiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateDumplingaiCredential(input.apiKey, fetcher);
  },
};
