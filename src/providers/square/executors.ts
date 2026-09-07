import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { squareActionHandlers, squareApiBaseUrl, squareApiVersion, validateSquareCredential } from "./runtime.ts";

const service = "square";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, squareActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: squareApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("square-version", squareApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSquareCredential(input.apiKey, fetcher, signal);
  },
};
