import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateZerobounceCredential, zerobounceActionHandlers, zerobounceApiBaseUrl } from "./runtime.ts";

const service = "zerobounce";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zerobounceActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zerobounceApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateZerobounceCredential(input.apiKey, fetcher, signal);
  },
};
