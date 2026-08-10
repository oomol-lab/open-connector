import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { valyuActionHandlers, validateValyuCredential } from "./runtime.ts";

const service = "valyu";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, valyuActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateValyuCredential(input.apiKey, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.valyu.ai",
  auth: { type: "api_key_header", name: "x-api-key" },
});
