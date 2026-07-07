import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  hookdeckActionHandlers,
  hookdeckApiBaseUrl,
  hookdeckApiPrefix,
  validateHookdeckCredential,
} from "./runtime.ts";

const service = "hookdeck";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, hookdeckActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: `${hookdeckApiBaseUrl}${hookdeckApiPrefix}`,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateHookdeckCredential,
};
