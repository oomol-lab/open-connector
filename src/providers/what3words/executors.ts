import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { validateWhat3wordsCredential, what3wordsActionHandlers } from "./runtime.ts";

const service = "what3words";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, what3wordsActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWhat3wordsCredential(input.apiKey, fetcher, signal);
  },
};
