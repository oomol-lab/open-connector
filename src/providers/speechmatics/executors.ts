import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { speechmaticsActionHandlers, validateSpeechmaticsCredential } from "./runtime.ts";

const service = "speechmatics";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, speechmaticsActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSpeechmaticsCredential(input.apiKey, fetcher, signal);
  },
};
