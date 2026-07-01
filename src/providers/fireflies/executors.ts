import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { firefliesActionHandlers, validateFirefliesCredential } from "./runtime.ts";

const service = "fireflies";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, firefliesActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFirefliesCredential(input.apiKey, fetcher, signal);
  },
};
