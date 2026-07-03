import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { betterStackActionHandlers, validateBetterStackCredential } from "./runtime.ts";

const service = "better_stack";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, betterStackActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBetterStackCredential(input.apiKey, fetcher, signal);
  },
};
