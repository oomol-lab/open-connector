import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { mailersendActionHandlers, mailersendApiBaseUrl, validateMailersendCredential } from "./runtime.ts";

const service = "mailersend";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailersendActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mailersendApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMailersendCredential(input.apiKey, fetcher, signal);
  },
};
