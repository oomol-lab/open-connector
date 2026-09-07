import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { screenshotoneActionHandlers, screenshotoneApiBaseUrl, validateScreenshotoneApiKey } from "./runtime.ts";

const service = "screenshotone";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, screenshotoneActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: screenshotoneApiBaseUrl,
  auth: { type: "api_key_query", name: "access_key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateScreenshotoneApiKey(input.apiKey, fetcher, signal);
  },
};
