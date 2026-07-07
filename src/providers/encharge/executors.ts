import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { enchargeActionHandlers, enchargeApiBaseUrl, validateEnchargeCredential } from "./runtime.ts";

const service = "encharge";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, enchargeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: enchargeApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Encharge-Token" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEnchargeCredential(input.apiKey, fetcher, signal);
  },
};
