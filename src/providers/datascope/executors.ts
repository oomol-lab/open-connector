import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { datascopeActionHandlers, datascopeApiBaseUrl, validateDatascopeCredential } from "./runtime.ts";

const service = "datascope";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, datascopeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: datascopeApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateDatascopeCredential({ apiKey: input.apiKey }, fetcher);
  },
};
