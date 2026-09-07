import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { screenshotbaseActionHandlers, screenshotbaseApiBaseUrl, validateScreenshotbaseCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "screenshotbase",
  screenshotbaseActionHandlers,
  { skipDnsValidation: true },
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "screenshotbase",
  baseUrl: screenshotbaseApiBaseUrl,
  auth: { type: "api_key_header", name: "apikey" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateScreenshotbaseCredential(input, fetcher);
  },
};
