import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { linkupActionHandlers, linkupApiBaseUrl, validateLinkupCredential } from "./runtime.ts";

const service = "linkup";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, linkupActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: linkupApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLinkupCredential(input.apiKey, fetcher, signal);
  },
};
