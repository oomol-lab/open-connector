import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { alchemyActionHandlers, validateAlchemyCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("alchemy", alchemyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAlchemyCredential(input.apiKey, fetcher, signal);
  },
};
