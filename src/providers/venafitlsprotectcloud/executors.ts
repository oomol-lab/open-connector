import type { CredentialValidators } from "../../core/types.ts";

import { executors, validateVenafiCloudCredential } from "./runtime.ts";

export { executors };

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateVenafiCloudCredential({ apiKey: input.apiKey, ...input.values }, fetcher, signal);
  },
};
