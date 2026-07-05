import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { daffyActionHandlers, validateDaffyCredential } from "./runtime.ts";

const service = "daffy";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, daffyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDaffyCredential(input.apiKey, fetcher, signal);
  },
};
