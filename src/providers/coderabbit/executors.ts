import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { coderabbitActionHandlers, validateCoderabbitApiKey } from "./runtime.ts";

const service = "coderabbit";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, coderabbitActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey: validateCoderabbitApiKey,
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.coderabbit.ai",
  auth: { type: "api_key_header", name: "x-coderabbitai-api-key" },
});
