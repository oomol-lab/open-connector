import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { data247ActionHandlers, data247ApiBaseUrl, validateData247Credential } from "./runtime.ts";

const service = "data247";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, data247ActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: data247ApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateData247Credential(input.apiKey, fetcher, signal);
  },
};
