import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { demodeskActionHandlers, validateDemodeskCredential } from "./runtime.ts";

const service = "demodesk";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, demodeskActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDemodeskCredential(input.apiKey, fetcher, signal);
  },
};
