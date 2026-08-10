import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { mailsSoActionHandlers, validateMailsSoCredential } from "./runtime.ts";

const service = "mails_so";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailsSoActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMailsSoCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.mails.so",
  auth: { type: "api_key_header", name: "x-mails-api-key" },
});
