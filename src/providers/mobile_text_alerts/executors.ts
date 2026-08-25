import type { CredentialValidators } from "../../core/types.ts";

import { executors, validateMobileTextAlertsCredential } from "./runtime.ts";

export { executors };

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMobileTextAlertsCredential(input.apiKey, fetcher, signal);
  },
};
