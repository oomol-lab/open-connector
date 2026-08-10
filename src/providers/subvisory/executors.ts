import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { subvisoryActionHandlers, validateSubvisoryCredential } from "./runtime.ts";

const service = "subvisory";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, subvisoryActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSubvisoryCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://www.subvisory.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
