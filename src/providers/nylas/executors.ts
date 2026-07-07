import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { nylasActionHandlers, nylasApiBaseUrl, validateNylasCredential } from "./runtime.ts";

const service = "nylas";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, nylasActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: nylasApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNylasCredential(input.apiKey, fetcher, signal);
  },
};
