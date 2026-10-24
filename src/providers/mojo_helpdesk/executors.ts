import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { mojoHelpdeskActionHandlers, mojoHelpdeskApiBaseUrl, validateMojoHelpdeskCredential } from "./runtime.ts";

const service = "mojo_helpdesk";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mojoHelpdeskActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mojoHelpdeskApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMojoHelpdeskCredential(input.apiKey, fetcher, signal);
  },
};
