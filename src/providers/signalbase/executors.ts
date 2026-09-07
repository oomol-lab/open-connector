import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { signalbaseActionHandlers, signalbaseApiBaseUrl, validateSignalbaseCredential } from "./runtime.ts";

const service = "signalbase";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, signalbaseActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: signalbaseApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): ReturnType<typeof validateSignalbaseCredential> {
    return validateSignalbaseCredential({ ...input.values, apiKey: input.apiKey }, fetcher, signal);
  },
};
