import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { octaveActionHandlers, octaveApiBaseUrl, validateOctaveCredential } from "./runtime.ts";

const service = "octave";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, octaveActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: octaveApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "api_key",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOctaveCredential(input.apiKey, fetcher, signal);
  },
};
