import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateVeriphoneCredential, veriphoneActionHandlers, veriphoneApiBaseUrl } from "./runtime.ts";

const service = "veriphone";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, veriphoneActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: veriphoneApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateVeriphoneCredential(input.apiKey, fetcher, signal);
  },
};
