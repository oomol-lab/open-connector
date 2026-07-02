import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { validateViggleCredential, viggleActionHandlers } from "./runtime.ts";

const service = "viggle";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, viggleActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateViggleCredential(input.apiKey, fetcher, signal);
  },
};
