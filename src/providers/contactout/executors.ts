import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { contactoutActionHandlers, contactoutApiBaseUrl, validateContactoutCredential } from "./runtime.ts";

const service = "contactout";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, contactoutActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: contactoutApiBaseUrl,
  auth: { type: "api_key_header", name: "token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("authorization", "basic");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateContactoutCredential(input.apiKey, fetcher, signal);
  },
};
