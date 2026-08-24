import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { tmdbActionHandlers, validateTmdbCredential } from "./runtime.ts";

const service = "tmdb";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tmdbActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTmdbCredential(input.apiKey, fetcher, signal);
  },
};
