import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { beehiivActionHandlers, validateBeehiivCredential } from "./runtime.ts";

const service = "beehiiv";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, beehiivActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBeehiivCredential(input.apiKey, fetcher, signal);
  },
};
