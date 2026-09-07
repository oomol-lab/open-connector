import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { raygunActionHandlers, raygunApiBaseUrl, validateRaygunCredential } from "./runtime.ts";

const service = "raygun";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, raygunActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: raygunApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateRaygunCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
