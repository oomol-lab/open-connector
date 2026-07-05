import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { feltActionHandlers, validateFeltCredential } from "./runtime.ts";

const service = "felt";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, feltActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFeltCredential(input.apiKey, fetcher, signal);
  },
};
