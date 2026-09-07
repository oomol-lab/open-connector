import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { mezmoActionHandlers, mezmoApiBaseUrl, validateMezmoCredential } from "./runtime.ts";

const service = "mezmo";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mezmoActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mezmoApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMezmoCredential(input.apiKey, fetcher, signal);
  },
};
