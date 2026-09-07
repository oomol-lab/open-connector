import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { marketstackActionHandlers, marketstackApiBaseUrl, validateMarketstackCredential } from "./runtime.ts";

const service = "marketstack";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, marketstackActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: marketstackApiBaseUrl,
  auth: { type: "api_key_query", name: "access_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateMarketstackCredential,
};
