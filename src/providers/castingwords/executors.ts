import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { castingwordsActionHandlers, castingwordsApiBaseUrl, validateCastingwordsCredential } from "./runtime.ts";

const service = "castingwords";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, castingwordsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: castingwordsApiBaseUrl,
  auth: {
    type: "api_key_query",
    name: "api_key",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCastingwordsCredential(input.apiKey, fetcher, signal);
  },
};
