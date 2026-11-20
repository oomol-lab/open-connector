import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { talenthrActionHandlers, talenthrApiBaseUrl, validateTalenthrCredential } from "./runtime.ts";

const service = "talenthr";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, talenthrActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: talenthrApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  defaultHeaders: { accept: "application/json" },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTalenthrCredential,
};
