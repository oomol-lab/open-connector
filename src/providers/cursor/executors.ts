import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { cursorActionHandlers, cursorApiBaseUrl, validateCursorCredential } from "./runtime.ts";

const service = "cursor";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cursorActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cursorApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCursorCredential(input.apiKey, fetcher, signal);
  },
};
