import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { signwellActionHandlers, validateSignwellCredential } from "./runtime.ts";

const service = "signwell";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, signwellActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSignwellCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://www.signwell.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
