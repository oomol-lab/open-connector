import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { papertrailActionHandlers, validatePapertrailCredential } from "./runtime.ts";
const service = "papertrail";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, papertrailActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://papertrailapp.com/api/v1/",
  auth: { type: "api_key_header", name: "x-papertrail-token" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePapertrailCredential(input.apiKey, fetcher, signal);
  },
};
