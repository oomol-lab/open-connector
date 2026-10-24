import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { validateYGyCredential, yGyActionHandlers, yGyApiBaseUrl } from "./runtime.ts";

const service = "y_gy";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, yGyActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: yGyApiBaseUrl,
  auth: { type: "api_key_header", name: "api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateYGyCredential,
};
