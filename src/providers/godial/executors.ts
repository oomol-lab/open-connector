import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { godialActionHandlers, godialApiBaseUrl, validateGodialCredential } from "./runtime.ts";

const service = "godial";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, godialActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: godialApiBaseUrl,
  auth: { type: "api_key_query", name: "access_token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, multipart/form-data, application/x-www-form-urlencoded");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGodialCredential(input, fetcher, signal);
  },
};
