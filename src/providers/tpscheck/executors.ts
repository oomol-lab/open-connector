import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tpscheckActionHandlers, tpscheckApiBaseUrl, validateTpscheckCredential } from "./runtime.ts";

const service = "tpscheck";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: tpscheckApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tpscheckActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey: validateTpscheckCredential,
};
