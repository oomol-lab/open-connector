import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { cursorActionHandlers, validateCursorCredential } from "./runtime.ts";

const service = "cursor";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cursorActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateCursorCredential(input.apiKey, fetcher, signal);
  },
};
