import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { altTextAiActionHandlers, validateAltTextAiCredential } from "./runtime.ts";

const service = "alt_text_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, altTextAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAltTextAiCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
