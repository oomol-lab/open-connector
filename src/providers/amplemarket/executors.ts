import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { amplemarketActionHandlers, amplemarketApiBaseUrl, validateAmplemarketCredential } from "./runtime.ts";

const service = "amplemarket";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, amplemarketActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: amplemarketApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAmplemarketCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
