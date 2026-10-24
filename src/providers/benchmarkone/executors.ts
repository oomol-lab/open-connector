import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { benchmarkoneActionHandlers, benchmarkoneApiBaseUrl, validateBenchmarkoneCredential } from "./runtime.ts";

const service = "benchmarkone";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, benchmarkoneActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: benchmarkoneApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    try {
      return await validateBenchmarkoneCredential(input.apiKey, fetcher, signal);
    } catch (error) {
      if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
        throw new ProviderRequestError(400, error.message, error.details);
      }
      throw error;
    }
  },
};
