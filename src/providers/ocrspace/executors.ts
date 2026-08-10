import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { ocrspaceActionHandlers, validateOcrspaceCredential } from "./runtime.ts";

const service = "ocrspace";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ocrspaceActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOcrspaceCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.ocr.space",
  auth: { type: "api_key_query", name: "apikey" },
});
