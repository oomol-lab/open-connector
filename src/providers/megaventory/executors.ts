import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { megaventoryActionHandlers, megaventoryApiBaseUrl, validateMegaventoryCredential } from "./runtime.ts";

const service = "megaventory";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: megaventoryApiBaseUrl,
  auth: { type: "api_key_json_body", name: "APIKEY" },
  skipDnsValidation: true,
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, megaventoryActionHandlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMegaventoryCredential(input.apiKey, fetcher, signal);
  },
};
