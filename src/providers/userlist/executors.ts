import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { userlistActionHandlers, userlistPushApiBaseUrl, validateUserlistCredential } from "./runtime.ts";

const service = "userlist";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, userlistActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: userlistPushApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Push " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(): Promise<CredentialValidationResult> {
    return Promise.resolve(validateUserlistCredential());
  },
};
