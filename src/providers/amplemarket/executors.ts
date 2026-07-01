import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { amplemarketActionHandlers, validateAmplemarketCredential } from "./runtime.ts";

const service = "amplemarket";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, amplemarketActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAmplemarketCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
