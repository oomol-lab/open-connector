import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { owlProtocolActionHandlers, validateOwlProtocolCredential } from "./runtime.ts";

const service = "owl_protocol";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, owlProtocolActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOwlProtocolCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.owl.build",
  auth: { type: "api_key_header", name: "x-api-key" },
});
