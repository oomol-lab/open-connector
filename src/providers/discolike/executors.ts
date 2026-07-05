import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { discolikeActionHandlers, validateDiscolikeCredential } from "./runtime.ts";

const service = "discolike";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, discolikeActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDiscolikeCredential(input.apiKey, fetcher, signal);
  },
};
