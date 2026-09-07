import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { desktimeActionHandlers, desktimeApiBaseUrl, validateDeskTimeCredential } from "./runtime.ts";

const service = "desktime";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, desktimeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: desktimeApiBaseUrl,
  auth: { type: "api_key_query", name: "apiKey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDeskTimeCredential(input.apiKey, fetcher, signal);
  },
};
