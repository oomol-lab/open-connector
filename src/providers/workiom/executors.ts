import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  validateWorkiomCredential,
  workiomActionHandlers,
  workiomApiBaseUrl,
  workiomApiPathPrefix,
} from "./runtime.ts";

const service = "workiom";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, workiomActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: `${workiomApiBaseUrl}${workiomApiPathPrefix}`,
  auth: { type: "api_key_header", name: "X-Api-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWorkiomCredential(input.apiKey, fetcher, signal);
  },
};
