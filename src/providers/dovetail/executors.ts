import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { dovetailActionHandlers, dovetailApiBaseUrl, validateDovetailCredential } from "./runtime.ts";

const service = "dovetail";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dovetailActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dovetailApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDovetailCredential(input.apiKey, fetcher, signal);
  },
};
