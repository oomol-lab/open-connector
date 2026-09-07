import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { mailblusterActionHandlers, mailblusterApiBaseUrl, validateMailblusterCredential } from "./runtime.ts";

const service = "mailbluster";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailblusterActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mailblusterApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMailblusterCredential(input.apiKey, fetcher, signal);
  },
};
