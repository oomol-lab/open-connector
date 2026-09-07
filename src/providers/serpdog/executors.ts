import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { serpdogBaseUrl, serpdogExecutors, validateSerpdogCredential } from "./runtime.ts";

export const executors: ProviderExecutors = serpdogExecutors;

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "serpdog",
  baseUrl: serpdogBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSerpdogCredential(input.apiKey, fetcher, signal);
  },
};
