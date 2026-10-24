import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { arofloActionHandlers, arofloApiBaseUrl, validateArofloCredential } from "./runtime.ts";

const service = "aroflo";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, arofloActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: arofloApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateArofloCredential(input.apiKey, fetcher, signal);
  },
};
