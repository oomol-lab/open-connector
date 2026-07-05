import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { e2bActionHandlers, validateE2bCredential } from "./runtime.ts";

const service = "e2b";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, e2bActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateE2bCredential(input.apiKey, fetcher, signal);
  },
};
