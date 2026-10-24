import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { unioneActionHandlers, unioneApiBaseUrl, validateUnioneCredential } from "./runtime.ts";

const service = "unione";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, unioneActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: unioneApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateUnioneCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
