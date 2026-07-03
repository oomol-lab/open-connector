import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { benzingaActionHandlers, validateBenzingaCredential } from "./runtime.ts";

const service = "benzinga";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, benzingaActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBenzingaCredential(input.apiKey, fetcher, signal);
  },
};
