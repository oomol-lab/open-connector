import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWebvizioCredential, webvizioActionHandlers, webvizioApiBaseUrl } from "./runtime.ts";

const service = "webvizio";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, webvizioActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: webvizioApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWebvizioCredential(input.apiKey, fetcher, signal);
  },
};
