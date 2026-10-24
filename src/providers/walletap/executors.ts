import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { validateWalletapCredential, walletapActionHandlers } from "./runtime.ts";

const service = "walletap";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, walletapActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.walletap.io",
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWalletapCredential(input.apiKey, fetcher, signal);
  },
};
