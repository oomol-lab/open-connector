import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy, mapProviderActionSources } from "../provider-runtime.ts";
import { deepgramActionHandlers, deepgramApiBaseUrl, validateDeepgramCredential } from "./runtime.ts";

const service = "deepgram";

const handlers = mapProviderActionSources(
  service,
  deepgramActionHandlers,
  (_name, handler) => (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    handler(input, context.fetcher, context.apiKey),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: deepgramApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateDeepgramCredential({ apiKey: input.apiKey }, fetcher);
  },
};
