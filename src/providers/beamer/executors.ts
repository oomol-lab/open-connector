import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { beamerActionHandlers, validateBeamerCredential } from "./runtime.ts";

const service = "beamer";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, beamerActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBeamerCredential(input.apiKey, fetcher, signal);
  },
};
