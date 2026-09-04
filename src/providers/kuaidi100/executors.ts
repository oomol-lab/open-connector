import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { kuaidi100ActionHandlers, kuaidi100ApiBaseUrl, validateKuaidi100Credential } from "./runtime.ts";

const service = "kuaidi100";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, kuaidi100ActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: kuaidi100ApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKuaidi100Credential(input.apiKey, fetcher, signal);
  },
};
