import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { elasticemailActionHandlers, elasticemailApiBaseUrl, validateElasticemailCredential } from "./runtime.ts";

const service = "elasticemail";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, elasticemailActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: elasticemailApiBaseUrl,
  auth: { type: "api_key_header", name: "X-ElasticEmail-ApiKey" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const visibleContactCount = await validateElasticemailCredential(input.apiKey, fetcher, signal);
    return {
      profile: {
        accountId: "elasticemail",
        displayName: "Elastic Email API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: elasticemailApiBaseUrl,
        validationEndpoint: "/contacts",
        visibleContactCount,
      },
    };
  },
};
