import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { elevenreaderActionHandlers, validateElevenreaderCredential } from "./runtime.ts";

const service = "elevenreader";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, elevenreaderActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateElevenreaderCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.elevenlabs.io/v1",
  auth: { type: "api_key_header", name: "xi-api-key" },
});
