import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { ambeeActionHandlers, ambeeApiBaseUrl, validateAmbeeCredential } from "./runtime.ts";

const service = "ambee";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ambeeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ambeeApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAmbeeCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
