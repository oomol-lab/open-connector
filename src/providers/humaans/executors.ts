import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { humaansActionHandlers, humaansApiBaseUrl, validateHumaansCredential } from "./runtime.ts";

const service = "humaans";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, humaansActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateHumaansCredential(input.apiKey, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: humaansApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});
