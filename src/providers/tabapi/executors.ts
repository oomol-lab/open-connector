import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tabapiActionHandlers, validateTabapiCredential } from "./runtime.ts";

const service = "tabapi";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tabapiActionHandlers);

export const credentialValidators: CredentialValidators = { apiKey: validateTabapiCredential };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://tabapi.com/api/v1/",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
