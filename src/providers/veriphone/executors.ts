import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { validateVeriphoneCredential, veriphoneActionHandlers } from "./runtime.ts";

const service = "veriphone";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, veriphoneActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateVeriphoneCredential(input.apiKey, fetcher, signal);
  },
};
