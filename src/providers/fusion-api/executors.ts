import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { fusionApiActionHandlers, fusionApiDefaultBaseUrl, validateFusionApiCredential } from "./runtime.ts";

const service = "fusion-api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fusionApiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: fusionApiDefaultBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateFusionApiCredential(input.apiKey, fetcher, signal);
  },
};
