import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  cockroachLabsActionHandlers,
  cockroachLabsApiBaseUrl,
  cockroachLabsApiVersion,
  validateCockroachLabsApiKey,
} from "./runtime.ts";

const service = "cockroach_labs";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cockroachLabsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cockroachLabsApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("cc-version", cockroachLabsApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateCockroachLabsApiKey,
};
