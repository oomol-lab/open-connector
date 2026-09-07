import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateDoubaoSeedreamCredential, doubaoSeedreamActionHandlers, doubaoSeedreamApiBaseUrl } from "./runtime.ts";

const service = "doubao_seedream";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, doubaoSeedreamActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: doubaoSeedreamApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDoubaoSeedreamCredential(input.apiKey, fetcher, signal);
  },
};
