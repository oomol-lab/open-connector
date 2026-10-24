import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { signaturelyActionHandlers, signaturelyApiBaseUrl, validateSignaturelyCredential } from "./runtime.ts";

const service = "signaturely";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, signaturelyActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: signaturelyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Api-Key " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSignaturelyCredential(input.apiKey, fetcher, signal);
  },
};
