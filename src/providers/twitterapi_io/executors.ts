import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { twitterapiIoActionHandlers, validateTwitterApiIoCredential } from "./runtime.ts";

const service = "twitterapi_io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, twitterapiIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTwitterApiIoCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.twitterapi.io",
  auth: { type: "api_key_header", name: "x-api-key" },
});
