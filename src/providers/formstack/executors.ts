import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { formstackActionHandlers, formstackApiBaseUrl, validateFormstackCredential } from "./runtime.ts";

const service = "formstack";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, formstackActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: formstackApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateFormstackCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
