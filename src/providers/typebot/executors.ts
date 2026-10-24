import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { typebotActionHandlers, typebotApiBaseUrl, validateTypebotCredential } from "./runtime.ts";

const service = "typebot";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, typebotActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: typebotApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTypebotCredential(input.apiKey, fetcher, signal);
  },
};
