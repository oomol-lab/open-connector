import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { sportsdataActionHandlers, sportsdataApiBaseUrl, validateSportsdataCredential } from "./runtime.ts";

const service = "sportsdata";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, sportsdataActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sportsdataApiBaseUrl,
  auth: { type: "api_key_header", name: "Ocp-Apim-Subscription-Key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSportsdataCredential(input.apiKey, fetcher, signal);
  },
};
