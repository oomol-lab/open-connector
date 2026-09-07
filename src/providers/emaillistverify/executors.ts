import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  emailListVerifyActionHandlers,
  emailListVerifyApiBaseUrl,
  validateEmailListVerifyCredential,
} from "./runtime.ts";

const service = "emaillistverify";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, emailListVerifyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: emailListVerifyApiBaseUrl,
  auth: { type: "api_key_query", name: "secret" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/plain");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEmailListVerifyCredential(input.apiKey, fetcher, signal);
  },
};
