import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { buildkiteActionHandlers, buildkiteApiBaseUrl, validateBuildkiteCredential } from "./runtime.ts";

const service = "buildkite";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, buildkiteActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: buildkiteApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBuildkiteCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};
