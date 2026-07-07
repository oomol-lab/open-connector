import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { instatusActionHandlers, instatusApiBaseUrl, validateInstatusCredential } from "./runtime.ts";

const service = "instatus";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, instatusActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateInstatusCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: instatusApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
  },
});
