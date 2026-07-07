import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { esignaturesIoActionHandlers, esignaturesIoApiBaseUrl, validateEsignaturesIoCredential } from "./runtime.ts";

const service = "esignatures_io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, esignaturesIoActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: esignaturesIoApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateEsignaturesIoCredential(input.apiKey, fetcher, signal);
  },
};
