import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { moesifActionHandlers, moesifApiBaseUrl, validateMoesifCredential } from "./runtime.ts";

const service = "moesif";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, moesifActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateMoesifCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: moesifApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
