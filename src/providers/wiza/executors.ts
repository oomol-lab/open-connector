import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWizaCredential, wizaActionHandlers, wizaApiBaseUrl } from "./runtime.ts";

const service = "wiza";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wizaApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, wizaActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWizaCredential(input.apiKey, fetcher, signal);
  },
};
