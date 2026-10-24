import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { codacyActionHandlers, validateCodacyApiKey } from "./runtime.ts";

const service = "codacy";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, codacyActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey: validateCodacyApiKey,
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://app.codacy.com",
  auth: { type: "api_key_header", name: "api-token" },
});
