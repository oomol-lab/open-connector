import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { nimbleActionHandlers, nimbleApiBaseUrl, validateNimbleCredential } from "./runtime.ts";

const service = "nimble";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, nimbleActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: nimbleApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await validateNimbleCredential({ apiKey: input.apiKey, fetcher, signal });
    return {
      profile: {
        accountId: optionalString(user.id) ?? optionalString(user.company_id),
        displayName: optionalString(user.name) ?? optionalString(user.email) ?? "Nimble API Key",
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: nimbleApiBaseUrl, companyId: optionalString(user.company_id) },
    };
  },
};
