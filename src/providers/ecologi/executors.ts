import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ecologiActionHandlers, ecologiApiBaseUrl, validateEcologiCredential } from "./runtime.ts";

const service = "ecologi";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ecologiActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEcologiCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ecologiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});
