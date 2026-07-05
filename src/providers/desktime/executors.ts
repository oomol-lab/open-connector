import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { desktimeActionHandlers, validateDeskTimeCredential } from "./runtime.ts";

const service = "desktime";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, desktimeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDeskTimeCredential(input.apiKey, fetcher, signal);
  },
};
