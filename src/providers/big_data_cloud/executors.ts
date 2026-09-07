import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { bigDataCloudActionHandlers, validateBigDataCloudCredential } from "./runtime.ts";

const service = "big_data_cloud";
const bigDataCloudApiBaseUrl = "https://api-bdc.net";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bigDataCloudActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bigDataCloudApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBigDataCloudCredential(input.apiKey, fetcher, signal);
  },
};
