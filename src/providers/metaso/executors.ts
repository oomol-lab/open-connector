import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { metasoActionHandlers, metasoApiBaseUrl, validateMetasoCredential } from "./runtime.ts";

const service = "metaso";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, metasoActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: metasoApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMetasoCredential(input.apiKey, fetcher, signal);
  },
};
