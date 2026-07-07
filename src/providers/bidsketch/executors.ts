import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { bidsketchActionHandlers, bidsketchApiBaseUrl, validateBidsketchCredential } from "./runtime.ts";

const service = "bidsketch";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bidsketchActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bidsketchApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: 'Token token="', suffix: '"' },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBidsketchCredential(input.apiKey, fetcher, signal);
  },
};
