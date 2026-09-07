import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { beaconchainActionHandlers, beaconchainApiBaseUrl, validateBeaconchainCredential } from "./runtime.ts";

const service = "beaconchain";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, beaconchainActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: beaconchainApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBeaconchainCredential(input.apiKey, fetcher, signal);
  },
};
