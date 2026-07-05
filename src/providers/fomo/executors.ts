import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { fomoActionHandlers, validateFomoCredential } from "./runtime.ts";

const service = "fomo";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fomoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFomoCredential(input.apiKey, fetcher, signal);
  },
};
