import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { cloudconvertActionHandlers, validateCloudconvertCredential } from "./runtime.ts";

const service = "cloudconvert";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cloudconvertActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCloudconvertCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.cloudconvert.com/v2",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});
