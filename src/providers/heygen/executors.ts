import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { heygenActionHandlers, validateHeygenCredential } from "./runtime.ts";

const service = "heygen";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, heygenActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey: validateHeygenCredential,
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.heygen.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
