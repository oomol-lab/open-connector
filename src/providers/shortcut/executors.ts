import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { shortcutActionHandlers, validateShortcutCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("shortcut", shortcutActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }): ReturnType<typeof validateShortcutCredential> {
    return validateShortcutCredential(input, fetcher);
  },
};
