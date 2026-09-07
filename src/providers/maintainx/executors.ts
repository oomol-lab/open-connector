import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { maintainxActionHandlers, maintainxApiBaseUrl, validateMaintainxCredential } from "./runtime.ts";

const service = "maintainx";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, maintainxActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: maintainxApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMaintainxCredential(input.apiKey, fetcher, signal);
  },
};
