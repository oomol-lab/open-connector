import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { mediastackActionHandlers, mediastackApiBaseUrl, validateMediastackCredential } from "./runtime.ts";

const service = "mediastack";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mediastackActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mediastackApiBaseUrl,
  auth: { type: "api_key_query", name: "access_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateMediastackCredential,
};
