import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateViggleCredential, viggleActionHandlers, viggleApiBaseUrl } from "./runtime.ts";

const service = "viggle";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, viggleActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: viggleApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateViggleCredential(input.apiKey, fetcher, signal);
  },
};
