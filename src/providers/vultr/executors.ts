import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { validateVultrCredential, vultrActionHandlers } from "./runtime.ts";

const service = "vultr";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, vultrActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateVultrCredential(input.apiKey, fetcher, signal);
  },
};
