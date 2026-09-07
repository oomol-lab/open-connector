import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { taggunActionHandlers, taggunApiBaseUrl, validateTaggunCredential } from "./runtime.ts";

const service = "taggun";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, taggunActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: taggunApiBaseUrl,
  auth: { type: "api_key_header", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTaggunCredential,
};
