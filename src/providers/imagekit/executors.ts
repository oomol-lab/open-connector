import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { imagekitActionHandlers, imagekitApiBaseUrl, validateImagekitCredential } from "./runtime.ts";

const service = "imagekit";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, imagekitActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: imagekitApiBaseUrl,
  auth: {
    type: "api_key_basic",
    suffix: ":",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateImagekitCredential,
};
