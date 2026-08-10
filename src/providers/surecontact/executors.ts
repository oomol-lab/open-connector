import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { surecontactActionHandlers, validateSureContactCredential } from "./runtime.ts";

const service = "surecontact";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, surecontactActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSureContactCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.surecontact.com/api/v1/public",
  auth: { type: "api_key_header", name: "x-api-key" },
});
