import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { givebutterActionHandlers, givebutterApiBaseUrl, validateGivebutterCredential } from "./runtime.ts";

const service = "givebutter";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, givebutterActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: givebutterApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGivebutterCredential(input, fetcher, signal);
  },
};
