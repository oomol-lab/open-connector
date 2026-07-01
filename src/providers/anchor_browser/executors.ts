import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { anchorBrowserActionHandlers, validateAnchorBrowserCredential } from "./runtime.ts";

const service = "anchor_browser";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, anchorBrowserActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAnchorBrowserCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};
