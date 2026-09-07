import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tikhubActionHandlers, tikhubApiBaseUrl, validateTikHubCredential } from "./runtime.ts";

const service = "tikhub";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tikhubActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tikhubApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }): ReturnType<typeof validateTikHubCredential> {
    return validateTikHubCredential({ ...input.values, apiKey: input.apiKey }, fetcher);
  },
};
