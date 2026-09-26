import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { framejetActionHandlers, framejetApiBaseUrl, validateFramejetApiKey } from "./runtime.ts";

const service = "framejet";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, framejetActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: framejetApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Api-Key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateFramejetApiKey(input.apiKey, fetcher, signal);
  },
};
