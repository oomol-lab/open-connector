import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { klipfolioActionHandlers, klipfolioApiBaseUrl, validateKlipfolioCredential } from "./runtime.ts";

const service = "klipfolio";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, klipfolioActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: klipfolioApiBaseUrl,
  auth: { type: "api_key_header", name: "kf-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateKlipfolioCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
