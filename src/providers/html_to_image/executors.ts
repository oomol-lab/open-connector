import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { htmlToImageActionHandlers, htmlToImageApiBaseUrl, validateHtmlToImageCredential } from "./runtime.ts";

const service = "html_to_image";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, htmlToImageActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: htmlToImageApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateHtmlToImageCredential,
};
