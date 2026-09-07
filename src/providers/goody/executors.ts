import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { goodyActionHandlers, goodyApiBaseUrl, validateGoodyCredential } from "./runtime.ts";

const service = "goody";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, goodyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: goodyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGoodyCredential(input, fetcher, signal);
  },
};
