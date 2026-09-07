import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { lemonSqueezyActionHandlers, lemonSqueezyApiBaseUrl, validateLemonSqueezyCredential } from "./runtime.ts";

const service = "lemon_squeezy";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lemonSqueezyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: lemonSqueezyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/vnd.api+json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLemonSqueezyCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
