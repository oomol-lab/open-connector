import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { northflankActionHandlers, northflankApiBaseUrl, validateNorthflankCredential } from "./runtime.ts";

const service = "northflank";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, northflankActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: northflankApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  defaultHeaders: { "accept": "application/json", "content-type": "application/json" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateNorthflankCredential(input.apiKey, fetcher, signal);
  },
};
