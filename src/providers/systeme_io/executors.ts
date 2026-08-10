import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { systemeIoActionHandlers, validateSystemeIoCredential } from "./runtime.ts";

const service = "systeme_io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, systemeIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSystemeIoCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.systeme.io",
  auth: { type: "api_key_header", name: "x-api-key" },
});
