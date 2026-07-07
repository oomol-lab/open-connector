import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { swaggerhubActionHandlers, swaggerhubApiOrigin, validateSwaggerhubCredential } from "./runtime.ts";

const service = "swaggerhub";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, swaggerhubActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: swaggerhubApiOrigin,
  auth: { type: "api_key_authorization", prefix: "" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSwaggerhubCredential(input, fetcher, signal);
  },
};
