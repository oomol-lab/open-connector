import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { chatpdfActionHandlers, chatpdfApiBaseUrl, validateChatpdfCredential } from "./runtime.ts";

const service = "chatpdf";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, chatpdfActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    return validateChatpdfCredential(input.apiKey);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: chatpdfApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
});
