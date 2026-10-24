import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { lodgifyActionHandlers, lodgifyApiBaseUrl, validateLodgifyCredential } from "./runtime.ts";

const service = "lodgify";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lodgifyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: lodgifyApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "X-ApiKey",
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLodgifyCredential(input.apiKey, fetcher, signal);
  },
};
