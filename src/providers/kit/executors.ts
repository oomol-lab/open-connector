import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { kitActionHandlers, validateKitCredential } from "./runtime.ts";

const service = "kit";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, kitActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKitCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.kit.com/v4",
  auth: { type: "api_key_header", name: "x-kit-api-key" },
});
