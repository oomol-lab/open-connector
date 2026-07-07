import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { manatalActionHandlers, manatalApiBaseUrl, validateManatalCredential } from "./runtime.ts";

const service = "manatal";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, manatalActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: manatalApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "Token ",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateManatalCredential(input.apiKey, fetcher, signal);
  },
};
