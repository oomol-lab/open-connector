import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { brevoActionHandlers, validateBrevoCredential } from "./runtime.ts";

const service = "brevo";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, brevoActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBrevoCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.brevo.com",
  auth: { type: "api_key_header", name: "api-key" },
});
