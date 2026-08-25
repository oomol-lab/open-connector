import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy, providerUserAgent } from "../provider-runtime.ts";
import { mcdonaldsCnMcpActionHandlers, mcdonaldsCnMcpEndpoint, validateMcdonaldsCnMcpCredential } from "./runtime.ts";

const service = "mcdonalds_cn_mcp";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mcdonaldsCnMcpActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mcdonaldsCnMcpEndpoint,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowedEndpoint: (endpoint) => endpoint === "/",
  customizeRequest({ headers }) {
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMcdonaldsCnMcpCredential(input.apiKey, fetcher, signal);
  },
};
