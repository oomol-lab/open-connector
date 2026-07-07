import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { beeminderActionHandlers, beeminderApiBaseUrl, validateBeeminderCredential } from "./runtime.ts";

const service = "beeminder";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, beeminderActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: beeminderApiBaseUrl,
  auth: { type: "api_key_query", name: "auth_token" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBeeminderCredential(input.apiKey, fetcher, signal);
  },
};
