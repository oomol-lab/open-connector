import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { validateWisburgCredential, wisburgActionHandlers, wisburgApiBaseUrl } from "./runtime.ts";

const service = "wisburg";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, wisburgActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wisburgApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = { apiKey: validateWisburgCredential };
