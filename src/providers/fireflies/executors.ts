import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { firefliesActionHandlers, firefliesGraphqlBaseUrl, validateFirefliesCredential } from "./runtime.ts";

const service = "fireflies";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, firefliesActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: firefliesGraphqlBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFirefliesCredential(input.apiKey, fetcher, signal);
  },
};
