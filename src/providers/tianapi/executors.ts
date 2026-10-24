import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { tianapiActionHandlers, tianapiApiBaseUrl, validateTianapiCredential } from "./runtime.ts";

const service = "tianapi";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tianapiActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tianapiApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTianapiCredential(input.apiKey, fetcher, signal);
  },
};
