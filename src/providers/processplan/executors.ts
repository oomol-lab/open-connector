import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { processplanActionHandlers, processplanApiBaseUrl, validateProcessplanCredential } from "./runtime.ts";

const service = "processplan";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, processplanActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: processplanApiBaseUrl,
  auth: { type: "api_key_header", name: "tkn_id" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateProcessplanCredential(input.apiKey, fetcher, signal);
  },
};
