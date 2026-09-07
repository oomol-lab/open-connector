import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { smtp2goActionHandlers, smtp2goApiBaseUrl, validateSmtp2goCredential } from "./runtime.ts";

const service = "smtp2go";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, smtp2goActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: smtp2goApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Smtp2go-Api-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSmtp2goCredential(input.apiKey, fetcher, signal);
  },
};
