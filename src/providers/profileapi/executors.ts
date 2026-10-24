import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { profileapiActionHandlers, profileapiApiBaseUrl, validateProfileapiCredential } from "./runtime.ts";

const service = "profileapi";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, profileapiActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: profileapiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "ApiKey " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateProfileapiCredential(input.apiKey, fetcher);
  },
};
