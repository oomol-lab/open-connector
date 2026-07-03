import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { bestbuyActionHandlers, validateBestbuyCredential } from "./runtime.ts";

const service = "bestbuy";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bestbuyActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBestbuyCredential(input.apiKey, fetcher, signal);
  },
};
