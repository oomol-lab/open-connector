import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  assuredPlatformActionHandlers,
  assuredPlatformApiBaseUrl,
  validateAssuredPlatformCredential,
} from "./runtime.ts";

const service = "assured_platform";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, assuredPlatformActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: assuredPlatformApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateAssuredPlatformCredential(input.apiKey, fetcher, signal);
  },
};
