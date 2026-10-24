import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { lapostaActionHandlers, lapostaApiBaseUrl, validateLapostaCredential } from "./runtime.ts";

const service = "laposta";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lapostaActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: lapostaApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLapostaCredential(input.apiKey, fetcher, signal);
  },
};
