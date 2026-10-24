import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { mailercloudActionHandlers, mailercloudApiBaseUrl, validateMailercloudCredential } from "./runtime.ts";

const service = "mailercloud";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailercloudActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mailercloudApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "Authorization",
  },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMailercloudCredential(input.apiKey, fetcher, signal);
  },
};
