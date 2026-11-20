import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { documensoActionHandlers, documensoApiBaseUrl, validateDocumensoCredential } from "./runtime.ts";

const service = "documenso";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, documensoActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: documensoApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "Authorization",
  },
  defaultHeaders: { accept: "application/json" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDocumensoCredential(input.apiKey, fetcher, signal);
  },
};
