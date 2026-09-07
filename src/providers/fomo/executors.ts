import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { fomoActionHandlers, fomoApiBaseUrl, validateFomoCredential } from "./runtime.ts";

const service = "fomo";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fomoActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: fomoApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFomoCredential(input.apiKey, fetcher, signal);
  },
};
