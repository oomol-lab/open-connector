import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { theOddsApiActionHandlers, theOddsApiBaseUrl, validateTheOddsApiCredential } from "./runtime.ts";

const service = "the_odds_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, theOddsApiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: theOddsApiBaseUrl,
  auth: { type: "api_key_query", name: "apiKey" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTheOddsApiCredential,
};
