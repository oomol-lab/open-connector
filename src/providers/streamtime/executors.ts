import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { streamtimeActionHandlers, streamtimeApiBaseUrl, validateStreamtimeCredential } from "./runtime.ts";

const service = "streamtime";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, streamtimeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: streamtimeApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateStreamtimeCredential(input.apiKey, fetcher, signal);
  },
};
