import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { resendActionHandlers, resendApiBaseUrl, validateResendCredential } from "./runtime.ts";

const service = "resend";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, resendActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: resendApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateResendCredential(input.apiKey, fetcher, signal);
  },
};
