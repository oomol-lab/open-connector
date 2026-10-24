import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { validateZenkitCredential, zenkitActionHandlers, zenkitApiBaseUrl } from "./runtime.ts";

const service = "zenkit";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zenkitActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zenkitApiBaseUrl,
  auth: { type: "api_key_header", name: "Zenkit-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateZenkitCredential(input.apiKey, fetcher, signal);
  },
};
