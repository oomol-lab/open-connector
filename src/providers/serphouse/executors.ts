import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { serphouseActionHandlers, serphouseBaseUrl, validateSerphouseCredential } from "./runtime.ts";

const service = "serphouse";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, serphouseActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: serphouseBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSerphouseCredential(input.apiKey, fetcher, signal);
  },
};
