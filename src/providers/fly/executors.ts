import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { flyActionHandlers, validateFlyCredential } from "./runtime.ts";

const service = "fly";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, flyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFlyCredential(input.apiKey, fetcher, signal);
  },
};
