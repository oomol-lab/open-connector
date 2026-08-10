import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { fireberryActionHandlers, validateFireberryApiKey } from "./runtime.ts";

const service = "fireberry";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fireberryActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFireberryApiKey(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.fireberry.com",
  auth: { type: "api_key_header", name: "tokenid" },
});
