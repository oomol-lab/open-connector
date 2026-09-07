import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateVapiCredential, vapiActionHandlers, vapiApiBaseUrl } from "./runtime.ts";

const service = "vapi";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, vapiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: vapiApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateVapiCredential(input.apiKey, fetcher);
  },
};
