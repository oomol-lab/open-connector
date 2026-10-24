import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { memberstackActionHandlers, validateMemberstackCredential } from "./runtime.ts";

const service = "memberstack";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, memberstackActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMemberstackCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://admin.memberstack.com",
  auth: { type: "api_key_header", name: "x-api-key" },
});
