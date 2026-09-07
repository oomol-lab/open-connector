import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateVatlayerCredential, vatlayerActionHandlers, vatlayerApiBaseUrl } from "./runtime.ts";

const service = "vatlayer";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, vatlayerActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: vatlayerApiBaseUrl,
  auth: { type: "api_key_query", name: "access_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateVatlayerCredential(input.apiKey, fetcher);
  },
};
