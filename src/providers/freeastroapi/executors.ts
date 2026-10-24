import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { freeastroapiActionHandlers, freeastroapiBaseUrl, validateFreeastroapiCredential } from "./runtime.ts";

const service = "freeastroapi";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, freeastroapiActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: freeastroapiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateFreeastroapiCredential(requiredInputString(input.apiKey, "apiKey"), fetcher, signal);
  },
};
