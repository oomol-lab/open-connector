import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { byteformsActionHandlers, byteformsApiBaseUrl, validateByteformsCredential } from "./runtime.ts";

const service = "byteforms";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, byteformsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: byteformsApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateByteformsCredential(input.apiKey, fetcher, signal);
  },
};
