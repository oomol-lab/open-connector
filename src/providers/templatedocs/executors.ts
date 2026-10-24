import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { templatedocsActionHandlers, templatedocsApiBaseUrl, validateTemplateDocsCredential } from "./runtime.ts";

const service = "templatedocs";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, templatedocsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: templatedocsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTemplateDocsCredential(input.apiKey, fetcher, signal);
  },
};
