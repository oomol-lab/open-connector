import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { birdActionHandlers, birdApiBaseUrl, validateBirdCredential } from "./runtime.ts";

const service = "bird";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, birdActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: birdApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "AccessKey " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBirdCredential(input.apiKey, fetcher, signal);
  },
};
