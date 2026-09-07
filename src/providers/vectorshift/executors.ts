import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateVectorshiftCredential, vectorshiftActionHandlers, vectorshiftApiBaseUrl } from "./runtime.ts";

const service = "vectorshift";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, vectorshiftActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: vectorshiftApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateVectorshiftCredential(input.apiKey, fetcher);
  },
};
