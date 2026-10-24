import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { fengshuiActionHandlers, fengshuiApiBaseUrl, requestFengshuiJson } from "./runtime.ts";

const service = "fengshui";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fengshuiActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: fengshuiApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestFengshuiJson("/me", {}, requiredInputString(input.apiKey, "apiKey"), fetcher, signal);
    return {
      profile: { displayName: "Feng Shui API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: fengshuiApiBaseUrl, validationEndpoint: "/me" },
    };
  },
};
