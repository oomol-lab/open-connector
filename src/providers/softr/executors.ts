import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { softrActionHandlers, softrApiBaseUrl, validateSoftrCredential } from "./runtime.ts";

const service = "softr";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, softrActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: softrApiBaseUrl,
  auth: { type: "api_key_header", name: "Softr-Api-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSoftrCredential(input.apiKey, fetcher, signal);
  },
};
