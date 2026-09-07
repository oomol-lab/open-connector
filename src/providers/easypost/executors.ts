import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { easypostActionHandlers, easypostApiBaseUrl, validateEasypostCredential } from "./runtime.ts";

const service = "easypost";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, easypostActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: easypostApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEasypostCredential(input.apiKey, fetcher, signal);
  },
};
