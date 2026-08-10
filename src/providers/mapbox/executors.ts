import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { mapboxActionHandlers, validateMapboxCredential } from "./runtime.ts";

const service = "mapbox";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mapboxActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMapboxCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.mapbox.com",
  auth: { type: "api_key_query", name: "access_token" },
});
