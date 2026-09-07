import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { mailerliteActionHandlers, mailerliteApiBaseUrl, validateMailerliteCredential } from "./runtime.ts";

const service = "mailerlite";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailerliteActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mailerliteApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMailerliteCredential(input.apiKey, fetcher, signal);
  },
};
