import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { hunterActionHandlers, validateHunterCredential } from "./runtime.ts";

const service = "hunter";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, hunterActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey: validateHunterCredential,
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.hunter.io/v2",
  auth: { type: "api_key_header", name: "x-api-key" },
});
