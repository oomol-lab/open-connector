import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { sensiboApiBaseUrl, sensiboExecutors, validateSensiboCredential } from "./runtime.ts";

export const executors: ProviderExecutors = sensiboExecutors;

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "sensibo",
  baseUrl: sensiboApiBaseUrl,
  auth: { type: "api_key_query", name: "apiKey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSensiboCredential(input.apiKey, fetcher, signal);
  },
};
