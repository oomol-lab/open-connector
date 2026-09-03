import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  eversignActionHandlers,
  eversignApiBaseUrl,
  eversignValidationPath,
  validateEversignCredential,
} from "./runtime.ts";

const service = "eversign";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, eversignActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: eversignApiBaseUrl,
  auth: { type: "api_key_query", name: "access_key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const { primary, businessCount } = await validateEversignCredential(input.apiKey, fetcher, signal);
    return {
      profile: {
        accountId: primary ? String(primary.businessId) : "eversign",
        displayName: primary?.businessName || "Xodo Sign API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: eversignApiBaseUrl,
        validationEndpoint: eversignValidationPath,
        primaryBusinessId: primary?.businessId,
        primaryBusinessName: primary?.businessName,
        businessCount,
      },
    };
  },
};
