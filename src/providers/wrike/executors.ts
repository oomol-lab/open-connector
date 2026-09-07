import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWrikeCredential, wrikeActionHandlers, wrikeApiBaseUrl } from "./runtime.ts";

const service = "wrike";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wrikeApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, wrikeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateWrikeCredential(input.apiKey, fetcher, signal);
  },
};
