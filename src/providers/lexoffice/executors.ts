import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { lexofficeActionHandlers, lexofficeApiBaseUrl, validateLexofficeCredential } from "./runtime.ts";

const service = "lexoffice";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lexofficeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: lexofficeApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLexofficeCredential(input.apiKey, fetcher, signal);
  },
};
