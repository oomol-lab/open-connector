import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  financialModelingPrepActionHandlers,
  financialModelingPrepApiBaseUrl,
  validateFinancialModelingPrepApiKey,
} from "./runtime.ts";

const service = "financial_modeling_prep";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, financialModelingPrepActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: financialModelingPrepApiBaseUrl,
  auth: { type: "api_key_query", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFinancialModelingPrepApiKey(input.apiKey, fetcher, signal);
  },
};
