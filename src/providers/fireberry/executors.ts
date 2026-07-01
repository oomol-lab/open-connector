import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { fireberryActionHandlers, validateFireberryApiKey } from "./runtime.ts";

const service = "fireberry";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fireberryActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateFireberryApiKey(input.apiKey, fetcher, signal);
  },
};
