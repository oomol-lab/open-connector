import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { catsActionHandlers, catsApiBaseUrl, validateCatsCredential } from "./runtime.ts";

const service = "cats";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, catsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: catsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateCatsCredential(input.apiKey, fetcher, signal);
  },
};
