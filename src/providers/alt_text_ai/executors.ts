import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { altTextAiActionHandlers, validateAltTextAiCredential } from "./runtime.ts";

const service = "alt_text_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, altTextAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAltTextAiCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://alttext.ai/api/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
});
