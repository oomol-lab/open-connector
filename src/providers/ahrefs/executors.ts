import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { ahrefsActionHandlers, validateAhrefsCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("ahrefs", ahrefsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAhrefsCredential(input.apiKey, fetcher, signal);
  },
};
