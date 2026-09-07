import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  microsoftClarityActionHandlers,
  microsoftClarityApiBaseUrl,
  validateMicrosoftClarityCredential,
} from "./runtime.ts";

const service = "microsoft_clarity";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, microsoftClarityActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: microsoftClarityApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMicrosoftClarityCredential(input.apiKey, fetcher, signal);
  },
};
