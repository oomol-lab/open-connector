import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { terminusAppActionHandlers, validateTerminusAppCredential } from "./runtime.ts";
const service = "terminus_app";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, terminusAppActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.terminusapp.com",
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTerminusAppCredential(input.apiKey, fetcher, signal);
  },
};
