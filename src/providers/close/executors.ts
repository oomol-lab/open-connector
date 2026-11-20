import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { closeActionHandlers, closeApiBaseUrl, validateCloseCredential } from "./runtime.ts";

const service = "close";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, closeActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: closeApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  defaultHeaders: { accept: "application/json" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCloseCredential(input.apiKey, fetcher, signal);
  },
};
