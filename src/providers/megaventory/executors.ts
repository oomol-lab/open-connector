import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { megaventoryActionHandlers, megaventoryApiBaseUrl, validateMegaventoryCredential } from "./runtime.ts";

const service = "megaventory";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: megaventoryApiBaseUrl,
  auth: { type: "api_key_json_body", name: "APIKEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, megaventoryActionHandlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMegaventoryCredential(input.apiKey, fetcher, signal);
  },
};
