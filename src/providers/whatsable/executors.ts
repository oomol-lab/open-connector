import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { validateWhatsableCredential, whatsableActionHandlers, whatsableApiBaseUrl } from "./runtime.ts";

const service = "whatsable";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, whatsableActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: whatsableApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWhatsableCredential(input.apiKey, fetcher, signal);
  },
};
