import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerUserAgent } from "../provider-runtime.ts";
import { nusiiProposalsActionHandlers, nusiiProposalsApiBaseUrl, validateNusiiProposalsCredential } from "./runtime.ts";

const service = "nusii_proposals";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, nusiiProposalsActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: nusiiProposalsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token token=" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNusiiProposalsCredential(input.apiKey, fetcher, signal);
  },
};
