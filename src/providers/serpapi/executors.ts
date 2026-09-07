import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { serpapiBaseUrl, serpapiExecutors, validateSerpapiCredential } from "./runtime.ts";

export const executors: ProviderExecutors = serpapiExecutors;

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "serpapi",
  baseUrl: serpapiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSerpapiCredential(input.apiKey, fetcher, signal);
  },
};
