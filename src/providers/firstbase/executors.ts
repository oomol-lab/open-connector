import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { firstbaseActionHandlers, validateFirstbaseCredential } from "./runtime.ts";

const service = "firstbase";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, firstbaseActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFirstbaseCredential(input.apiKey, fetcher, signal);
  },
};
