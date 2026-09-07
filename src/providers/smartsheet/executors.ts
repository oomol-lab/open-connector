import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { smartsheetActionHandlers, smartsheetApiBaseUrl, validateSmartsheetCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("smartsheet", smartsheetActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "smartsheet",
  baseUrl: smartsheetApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("smartsheet-integration-source"))
      headers.set("smartsheet-integration-source", "AI,OOMOL,oomol-connector");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSmartsheetCredential(input.apiKey, fetcher, signal);
  },
};
