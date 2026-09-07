import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { glyphicActionHandlers, glyphicApiBaseUrl, validateGlyphicCredential } from "./runtime.ts";

const service = "glyphic";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, glyphicActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: glyphicApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateGlyphicCredential(input.apiKey, fetcher, signal);
  },
};
