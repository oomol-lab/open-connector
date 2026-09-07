import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { doubaoSpeechActionHandlers, doubaoSpeechApiBaseUrl, validateDoubaoSpeechCredential } from "./runtime.ts";

const service = "doubao_speech";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, doubaoSpeechActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: doubaoSpeechApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDoubaoSpeechCredential(input.apiKey, fetcher, signal);
  },
};
