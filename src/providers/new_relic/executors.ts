import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { newRelicActionHandlers, newRelicRestBaseUrl, validateNewRelicCredential } from "./runtime.ts";

const service = "new_relic";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, newRelicActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: newRelicRestBaseUrl,
  auth: { type: "api_key_header", name: "Api-Key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateNewRelicCredential(input.apiKey, fetcher);
  },
};
