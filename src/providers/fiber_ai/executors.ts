import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { fiberAiActionHandlers, validateFiberAiCredential } from "./runtime.ts";

const service = "fiber_ai";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fiberAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFiberAiCredential(input.apiKey, fetcher, signal);
  },
};
