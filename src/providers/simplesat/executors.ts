import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { simplesatActionHandlers, validateSimplesatCredential } from "./runtime.ts";

const service = "simplesat";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, simplesatActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSimplesatCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.simplesat.io",
  auth: { type: "api_key_header", name: "x-simplesat-token" },
});
