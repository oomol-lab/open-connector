import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { betterProposalsActionHandlers, validateBetterProposalsCredential } from "./runtime.ts";

const service = "better_proposals";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, betterProposalsActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBetterProposalsCredential(input.apiKey, fetcher, signal);
  },
};
