import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { emailoctopusActionHandlers, emailoctopusApiBaseUrl, validateEmailoctopusCredential } from "./runtime.ts";

const service = "emailoctopus";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: emailoctopusApiBaseUrl,
  auth: { type: "api_key_query_or_json_body", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, emailoctopusActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEmailoctopusCredential(input.apiKey, fetcher, signal);
  },
};
