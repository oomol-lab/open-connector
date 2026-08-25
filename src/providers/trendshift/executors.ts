import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  trendshiftActionHandlers,
  trendshiftApiBaseUrl,
  trendshiftCredentialId,
  trendshiftValidationPath,
  validateTrendshiftCredential,
} from "./runtime.ts";

const service = "trendshift";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, trendshiftActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: trendshiftApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await validateTrendshiftCredential({ apiKey: input.apiKey, fetcher, signal });
    return {
      profile: {
        accountId: trendshiftCredentialId(input.apiKey),
        displayName: "Trendshift API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: trendshiftApiBaseUrl,
        validationEndpoint: `${trendshiftValidationPath}?limit=1`,
      },
    };
  },
};
