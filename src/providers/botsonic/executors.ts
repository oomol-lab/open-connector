import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  botsonicActionHandlers,
  botsonicApiBaseUrl,
  botsonicAuthHeader,
  validateBotsonicCredential,
} from "./runtime.ts";

const service = "botsonic";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, botsonicActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: botsonicApiBaseUrl,
  auth: { type: "api_key_header", name: botsonicAuthHeader },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBotsonicCredential(input.apiKey, fetcher, signal);
  },
};
