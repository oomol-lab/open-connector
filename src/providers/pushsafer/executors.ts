import type { CredentialValidators } from "../../core/types.ts";

import { executors, validatePushsaferCredential } from "./runtime.ts";

export { executors };

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePushsaferCredential({ apiKey: input.apiKey, ...input.values }, fetcher, signal);
  },
};
