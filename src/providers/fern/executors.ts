import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { fernActionHandlers, validateFernCredential } from "./runtime.ts";

const service = "fern";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fernActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFernCredential(input.apiKey, fetcher, signal);
  },
};
