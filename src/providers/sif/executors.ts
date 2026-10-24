import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { sifActionHandlers, sifMcpOrigin, validateSifCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("sif", sifActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "sif",
  baseUrl: sifMcpOrigin,
  auth: { type: "api_key_header", name: "secret-key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSifCredential(input.apiKey, fetcher, signal);
  },
};
