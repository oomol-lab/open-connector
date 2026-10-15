import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { arcmiraActionHandlers, validateArcmiraCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("arcmira", arcmiraActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateArcmiraCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};
