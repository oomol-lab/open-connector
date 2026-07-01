import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { alphaVantageActionHandlers, validateAlphaVantageCredential } from "./runtime.ts";

const service = "alpha_vantage";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, alphaVantageActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAlphaVantageCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
