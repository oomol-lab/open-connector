import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { cloudlayerActionHandlers, validateCloudlayerCredential } from "./runtime.ts";

const service = "cloudlayer";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cloudlayerActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCloudlayerCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.cloudlayer.io",
  auth: { type: "api_key_header", name: "x-api-key" },
});
