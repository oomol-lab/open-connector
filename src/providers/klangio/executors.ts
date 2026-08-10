import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { klangioActionHandlers, validateKlangioCredential } from "./runtime.ts";

const service = "klangio";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, klangioActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKlangioCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.klang.io",
  auth: { type: "api_key_header", name: "kl-api-key" },
});
