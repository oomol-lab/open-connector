import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateWolframAlphaApiCredential, wolframAlphaApiActionHandlers, wolframAlphaApiBaseUrl } from "./runtime.ts";

const service = "wolfram_alpha_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, wolframAlphaApiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wolframAlphaApiBaseUrl,
  allowedOrigins: ["https://www.wolframalpha.com"],
  auth: { type: "api_key_query", name: "appid" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWolframAlphaApiCredential(input.apiKey, fetcher, signal);
  },
};
