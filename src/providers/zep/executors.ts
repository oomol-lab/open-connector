import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { validateZepCredential, zepActionHandlers, zepApiBaseUrl } from "./runtime.ts";

const service = "zep";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zepActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zepApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Api-Key " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateZepCredential,
};
