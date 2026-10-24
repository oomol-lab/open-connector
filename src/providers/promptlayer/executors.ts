import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { promptLayerActionHandlers, promptLayerApiBaseUrl, validatePromptLayerCredential } from "./runtime.ts";

const service = "promptlayer";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, promptLayerActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: promptLayerApiBaseUrl,
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
  apiKey(input, { fetcher, signal }) {
    return validatePromptLayerCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};
