import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { passcreatorActionHandlers, passcreatorApiBaseUrl, validatePasscreatorCredential } from "./runtime.ts";

const service = "passcreator";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, passcreatorActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: passcreatorApiBaseUrl,
  auth: { type: "api_key_header", name: "authorization" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePasscreatorCredential(input.apiKey, fetcher, signal);
  },
};
