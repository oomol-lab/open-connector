import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { monicaCrmActionHandlers, monicaCrmApiBaseUrl, validateMonicaCrmCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("monica_crm", monicaCrmActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "monica_crm",
  baseUrl: monicaCrmApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateMonicaCrmCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: { accountId: result.providerAccountId, displayName: result.accountLabel },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
