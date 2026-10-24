import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { honeyhiveActionHandlers, honeyhiveApiBaseUrl, validateHoneyhiveCredential } from "./runtime.ts";

const service = "honeyhive";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, honeyhiveActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: honeyhiveApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateHoneyhiveCredential(input.apiKey, fetcher, signal);
  },
};
