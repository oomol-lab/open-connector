import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { validateVestaboardCredential, vestaboardActionHandlers, vestaboardCloudApiBaseUrl } from "./runtime.ts";

const service = "vestaboard";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, vestaboardActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: vestaboardCloudApiBaseUrl,
  auth: { type: "api_key_header", name: "x-vestaboard-token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateVestaboardCredential(input.apiKey, fetcher, signal);
  },
};
