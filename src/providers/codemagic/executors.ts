import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { codemagicActionHandlers, validateCodemagicApiKey } from "./runtime.ts";

const service = "codemagic";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, codemagicActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey: validateCodemagicApiKey,
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://codemagic.io",
  auth: { type: "api_key_header", name: "x-auth-token" },
});
