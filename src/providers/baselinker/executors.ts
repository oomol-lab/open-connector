import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { baseLinkerActionHandlers, baseLinkerApiBaseUrl, validateBaseLinkerCredential } from "./runtime.ts";

const service = "baselinker";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, baseLinkerActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: baseLinkerApiBaseUrl,
  auth: { type: "api_key_header", name: "x-bltoken" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateBaseLinkerCredential(input.apiKey, fetcher, signal);
  },
};
