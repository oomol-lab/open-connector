import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { trentActionHandlers, trentChatApiBaseUrl, validateTrentCredential } from "./runtime.ts";

const service = "trent";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, trentActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: trentChatApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "text/event-stream, application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input): ReturnType<typeof validateTrentCredential> {
    return validateTrentCredential(input.apiKey);
  },
};
