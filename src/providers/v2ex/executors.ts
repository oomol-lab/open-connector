import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerProxyEndpointPrefixes,
} from "../provider-runtime.ts";
import { v2exActionHandlers, validateV2exCredential } from "./runtime.ts";

const service = "v2ex";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, v2exActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateV2exCredential(input.apiKey, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://www.v2ex.com",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowedEndpoint: providerProxyEndpointPrefixes("/api"),
});
