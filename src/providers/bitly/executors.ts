import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { bitlyActionHandlers, validateBitlyCredential } from "./runtime.ts";

const service = "bitly";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bitlyActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBitlyCredential(input.apiKey, fetcher, signal);
  },
};
