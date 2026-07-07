import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { openHandsActionHandlers, openHandsApiBaseUrl, validateOpenHandsCredential } from "./runtime.ts";

const service = "open_hands";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, openHandsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: openHandsApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOpenHandsCredential(input.apiKey, fetcher, signal);
  },
};
