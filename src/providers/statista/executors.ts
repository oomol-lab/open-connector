import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { statistaActionHandlers, validateStatistaCredential } from "./runtime.ts";

const service = "statista";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, statistaActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateStatistaCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.statista.ai",
  auth: { type: "api_key_header", name: "x-api-key" },
});
