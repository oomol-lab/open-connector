import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { beeminderActionHandlers, validateBeeminderCredential } from "./runtime.ts";

const service = "beeminder";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, beeminderActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBeeminderCredential(input.apiKey, fetcher, signal);
  },
};
