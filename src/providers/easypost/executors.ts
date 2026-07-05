import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { easypostActionHandlers, validateEasypostCredential } from "./runtime.ts";

const service = "easypost";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, easypostActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEasypostCredential(input.apiKey, fetcher, signal);
  },
};
