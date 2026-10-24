import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { dropcontactActionHandlers, dropcontactApiBaseUrl, validateDropcontactCredential } from "./runtime.ts";

const service = "dropcontact";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dropcontactActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDropcontactCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dropcontactApiBaseUrl,
  auth: { type: "api_key_header", name: "x-access-token" },
});
