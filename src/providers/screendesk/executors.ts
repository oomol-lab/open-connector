import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { screendeskActionHandlers, screendeskApiBaseUrl, validateScreendeskCredential } from "./runtime.ts";

const service = "screendesk";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, screendeskActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: screendeskApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await validateScreendeskCredential({ apiKey: input.apiKey, fetcher, signal });
    return {
      profile: { displayName: "Screendesk API Token" },
      grantedScopes: [],
      metadata: { apiBaseUrl: screendeskApiBaseUrl, validationEndpoint: "/recordings" },
    };
  },
};
