import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { amaraActionHandlers, validateAmaraCredential } from "./runtime.ts";

const service = "amara";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, amaraActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAmaraCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://amara.org/api",
  auth: { type: "api_key_header", name: "x-api-key" },
});
