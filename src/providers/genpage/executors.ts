import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { genpageActionHandlers, genpageApiBaseUrl, validateGenpageCredential } from "./runtime.ts";

const service = "genpage";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, genpageActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: genpageApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, context) {
    return validateGenpageCredential(input.apiKey, context.fetcher, context.signal);
  },
};
