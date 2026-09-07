import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { plainActionHandlers, plainApiUrl, validatePlainCredential } from "./runtime.ts";

const service = "plain";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, plainActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: plainApiUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validatePlainCredential(input.apiKey, fetcher, signal);
  },
};
