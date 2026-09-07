import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { talenthrActionHandlers, talenthrApiBaseUrl, validateTalenthrCredential } from "./runtime.ts";

const service = "talenthr";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, talenthrActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: talenthrApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTalenthrCredential,
};
