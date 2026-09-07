import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { blocknativeActionHandlers, blocknativeApiBaseUrl, validateBlocknativeCredential } from "./runtime.ts";

const service = "blocknative";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, blocknativeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: blocknativeApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBlocknativeCredential(input.apiKey, fetcher, signal);
  },
};
