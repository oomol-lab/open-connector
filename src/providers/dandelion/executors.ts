import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { dandelionActionHandlers, validateDandelionApiKey } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("dandelion", dandelionActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateDandelionApiKey(input.apiKey, fetcher);
  },
};
