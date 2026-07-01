import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { amaraActionHandlers, validateAmaraCredential } from "./runtime.ts";

const service = "amara";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, amaraActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAmaraCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
