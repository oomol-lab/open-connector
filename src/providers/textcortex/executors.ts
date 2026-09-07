import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { textcortexActionHandlers, textcortexApiBaseUrl, validateTextcortexCredential } from "./runtime.ts";

const service = "textcortex";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, textcortexActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: textcortexApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTextcortexCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
