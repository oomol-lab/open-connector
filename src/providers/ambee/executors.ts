import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { ambeeActionHandlers, validateAmbeeCredential } from "./runtime.ts";

const service = "ambee";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ambeeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAmbeeCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
