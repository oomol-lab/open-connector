import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { googleRoutesActionHandlers, googleRoutesApiBaseUrl, validateGoogleRoutesCredential } from "./runtime.ts";

const service = "google_routes";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, googleRoutesActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: googleRoutesApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Goog-Api-Key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGoogleRoutesCredential(input, fetcher, signal);
  },
};
