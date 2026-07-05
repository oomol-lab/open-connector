import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { dialpadWfmActionHandlers, validateDialpadWfmCredential } from "./runtime.ts";

const service = "dialpad_wfm";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, dialpadWfmActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDialpadWfmCredential(input.apiKey, fetcher, signal);
  },
};
