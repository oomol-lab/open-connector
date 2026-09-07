import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { humanitixActionHandlers, humanitixApiBaseUrl, validateHumanitixCredential } from "./runtime.ts";

const service = "humanitix";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, humanitixActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: humanitixApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateHumanitixCredential,
};
