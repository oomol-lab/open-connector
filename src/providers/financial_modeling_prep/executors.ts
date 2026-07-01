import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { financialModelingPrepActionHandlers, validateFinancialModelingPrepApiKey } from "./runtime.ts";

const service = "financial_modeling_prep";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, financialModelingPrepActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFinancialModelingPrepApiKey(input.apiKey, fetcher, signal);
  },
};
