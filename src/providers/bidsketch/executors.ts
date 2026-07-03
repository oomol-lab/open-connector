import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { bidsketchActionHandlers, validateBidsketchCredential } from "./runtime.ts";

const service = "bidsketch";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bidsketchActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBidsketchCredential(input.apiKey, fetcher, signal);
  },
};
