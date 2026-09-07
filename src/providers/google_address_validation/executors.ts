import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  googleAddressValidationActionHandlers,
  googleAddressValidationApiBaseUrl,
  validateGoogleAddressValidationCredential,
} from "./runtime.ts";

const service = "google_address_validation";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  googleAddressValidationActionHandlers,
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: googleAddressValidationApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGoogleAddressValidationCredential(input, fetcher, signal);
  },
};
